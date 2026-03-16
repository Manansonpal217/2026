import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../lib/jwt.js'
import { getRedis } from '../db/redis.js'
import { prisma } from '../db/prisma.js'
import { isJtiBlacklisted } from '../db/redis.js'
import type { Config } from '../config.js'

export interface AuthenticatedUser {
  id: string
  org_id: string
  email: string
  name: string
  role: string
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedUser
  org?: { id: string; name: string; status: string }
}

// Cache key for user+org status (avoids DB hit on every request)
// TTL: 60 seconds — deactivations take effect within 1 minute
const USER_STATUS_TTL = 60
const USER_STATUS_PREFIX = 'user:status:'

interface CachedStatus {
  userStatus: string
  orgStatus: string
  orgName: string
  userName: string
  userEmail: string
}

export function createAuthenticateMiddleware(config: Config) {
  const redis = getRedis(config)

  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
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

      if (cachedRaw) {
        // Cache hit — no DB query needed (fast path)
        const cached: CachedStatus = JSON.parse(cachedRaw)
        userStatus = cached.userStatus
        orgStatus = cached.orgStatus
        orgName = cached.orgName
        userName = cached.userName
        userEmail = cached.userEmail
      } else {
        // Cache miss — query DB with minimal columns (no full include)
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            status: true,
            name: true,
            email: true,
            organization: { select: { id: true, name: true, status: true } },
          },
        })

        if (!user) {
          return reply.status(401).send({ code: 'USER_INACTIVE', message: 'User not found or inactive' })
        }

        userStatus = user.status
        orgStatus = user.organization.status
        orgName = user.organization.name
        userName = user.name
        userEmail = user.email

        // Populate cache asynchronously — don't block the response
        const toCache: CachedStatus = { userStatus, orgStatus, orgName, userName, userEmail }
        redis.set(
          `${USER_STATUS_PREFIX}${payload.sub}`,
          JSON.stringify(toCache),
          'EX',
          USER_STATUS_TTL
        ).catch(() => {}) // fire-and-forget
      }

      if (userStatus !== 'active') {
        return reply.status(401).send({ code: 'USER_INACTIVE', message: 'User not found or inactive' })
      }

      if (orgStatus === 'suspended') {
        return reply.status(402).send({ code: 'ORG_SUSPENDED', message: 'Organization access has been suspended' })
      }

      // Attach to request — role comes from JWT (cryptographically signed)
      ;(request as AuthenticatedRequest).user = {
        id: payload.sub,
        org_id: payload.org_id,
        email: userEmail,
        name: userName,
        role: payload.role,
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
