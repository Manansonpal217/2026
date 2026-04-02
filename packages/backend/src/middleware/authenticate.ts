import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../lib/jwt.js'
import { getRedis } from '../db/redis.js'
import { prisma } from '../db/prisma.js'
import { isJtiBlacklisted } from '../db/redis.js'
import type { Config } from '../config.js'
import { hasPermission, type Permission } from '../lib/permissions.js'

export interface AuthenticatedUser {
  id: string
  org_id: string
  email: string
  name: string
  role: string
  is_platform_admin: boolean
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedUser
  org?: { id: string; name: string; status: string }
}

// Cache key for user+org status (avoids DB hit on every request)
// TTL: 60 seconds — deactivations take effect within 1 minute
const USER_STATUS_TTL = 60
const USER_STATUS_PREFIX = 'user:status:v2:'

interface CachedStatus {
  userStatus: string
  orgStatus: string
  orgName: string
  userName: string
  userEmail: string
  isPlatformAdmin: boolean
  roleVersion: number
}

export function createAuthenticateMiddleware(config: Config) {
  const redis = getRedis(config)

  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = request.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
      return reply.status(401).send({ code: 'MISSING_TOKEN', message: 'Authorization required' })
    }

    try {
      // Step 1: Verify JWT signature and scope (pure CPU — no I/O)
      const payload = await verifyToken(token)

      // Step 2: JTI blacklist + user status check run concurrently
      const [blacklisted, cachedRaw] = await Promise.all([
        isJtiBlacklisted(redis, payload.jti),
        redis.get(`${USER_STATUS_PREFIX}${payload.sub}`),
      ])

      if (blacklisted) {
        return reply.status(401).send({ code: 'TOKEN_REVOKED', message: 'Token has been revoked' })
      }

      let userStatus: string
      let orgStatus: string
      let orgName: string
      let userName: string
      let userEmail: string
      let isPlatformAdmin: boolean
      let roleVersion: number

      if (cachedRaw) {
        // Cache hit — no DB query needed (fast path)
        const cached: CachedStatus = JSON.parse(cachedRaw)
        userStatus = cached.userStatus
        orgStatus = cached.orgStatus
        orgName = cached.orgName
        userName = cached.userName
        userEmail = cached.userEmail
        isPlatformAdmin = cached.isPlatformAdmin
        roleVersion = cached.roleVersion ?? 0
      } else {
        // Cache miss — query DB with minimal columns (no full include)
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            status: true,
            name: true,
            email: true,
            is_platform_admin: true,
            role_version: true,
            organization: { select: { id: true, name: true, status: true } },
          },
        })

        if (!user) {
          return reply
            .status(401)
            .send({ code: 'USER_INACTIVE', message: 'User not found or inactive' })
        }

        userStatus = user.status as string
        orgStatus = user.organization.status as string
        orgName = user.organization.name
        userName = user.name
        userEmail = user.email
        isPlatformAdmin = user.is_platform_admin
        roleVersion = user.role_version

        // Populate cache asynchronously — don't block the response
        const toCache: CachedStatus = {
          userStatus,
          orgStatus,
          orgName,
          userName,
          userEmail,
          isPlatformAdmin,
          roleVersion,
        }
        redis
          .set(
            `${USER_STATUS_PREFIX}${payload.sub}`,
            JSON.stringify(toCache),
            'EX',
            USER_STATUS_TTL
          )
          .catch(() => {}) // fire-and-forget
      }

      if (userStatus !== 'ACTIVE') {
        return reply
          .status(401)
          .send({ code: 'USER_INACTIVE', message: 'User not found or inactive' })
      }

      if (orgStatus === 'SUSPENDED') {
        return reply
          .status(402)
          .send({ code: 'ORG_SUSPENDED', message: 'Organization access has been suspended' })
      }

      // Step 3: role_version check — if the role was changed after this token was issued,
      // reject with ROLE_CHANGED so the client re-authenticates.
      const tokenRoleVersion = payload.role_version ?? 0
      if (tokenRoleVersion !== roleVersion) {
        // Evict stale cache so next login gets fresh data
        redis.del(`${USER_STATUS_PREFIX}${payload.sub}`).catch(() => {})
        return reply
          .status(403)
          .send({ code: 'ROLE_CHANGED', message: 'Your role has changed. Please sign in again.' })
      }

      // Attach to request — role comes from JWT (cryptographically signed)
      ;(request as AuthenticatedRequest).user = {
        id: payload.sub,
        org_id: payload.org_id,
        email: userEmail,
        name: userName,
        role: payload.role,
        is_platform_admin: isPlatformAdmin,
      }
      ;(request as AuthenticatedRequest).org = {
        id: payload.org_id,
        name: orgName,
        status: orgStatus,
      }
    } catch {
      return reply.status(401).send({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' })
    }
  }
}

export function requireRole(...roles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as AuthenticatedRequest).user
    if (!user) {
      return reply.status(401).send({ code: 'UNAUTHORIZED' })
    }
    if (!roles.includes(user.role)) {
      return reply.status(403).send({ code: 'FORBIDDEN', message: 'Insufficient permissions' })
    }
  }
}

export function requirePermission(...permissions: Permission[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as AuthenticatedRequest).user
    if (!user) {
      return reply.status(401).send({ code: 'UNAUTHORIZED' })
    }
    const ok = permissions.every((p) => hasPermission(user, p))
    if (!ok) {
      return reply.status(403).send({ code: 'FORBIDDEN', message: 'Insufficient permissions' })
    }
  }
}

export function requirePlatformAdmin() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as AuthenticatedRequest).user
    if (!user) {
      return reply.status(401).send({ code: 'UNAUTHORIZED' })
    }
    if (!user.is_platform_admin) {
      return reply
        .status(403)
        .send({ code: 'FORBIDDEN', message: 'Platform administrator access required' })
    }
  }
}

/** List all organizations (read-only directory) — org OWNER or platform admin. */
export function requirePlatformAdminOrOrgOwner() {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as AuthenticatedRequest).user
    if (!user) {
      return reply.status(401).send({ code: 'UNAUTHORIZED' })
    }
    if (user.is_platform_admin || user.role === 'OWNER') {
      return
    }
    return reply.status(403).send({
      code: 'FORBIDDEN',
      message: 'Organization owner or platform access required',
    })
  }
}

/** @deprecated Use requirePlatformAdminOrOrgOwner. Kept for callsites during migration. */
export const requirePlatformAdminOrOrgSuperAdmin = requirePlatformAdminOrOrgOwner
