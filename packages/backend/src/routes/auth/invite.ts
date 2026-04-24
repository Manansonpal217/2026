import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { hashPassword, hashRefreshToken } from '../../lib/password.js'
import { issueAccessToken, createRefreshToken } from '../../lib/jwt.js'
import { enqueueTransactionalEmail } from '../../services/email/enqueue.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { getAllowedInviteRoles } from '../../lib/permissions.js'
import {
  findRegisteredUserByEmail,
  isEmailAvailableForNewUser,
  isPrismaUniqueOnUserEmail,
  normalizeUserEmail,
} from '../../lib/user-email-availability.js'

const MAX_INVITE_NAME_PART = 80

function trimInviteNamePart(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const t = raw.trim().replace(/\s+/g, ' ')
  return t.length > MAX_INVITE_NAME_PART ? t.slice(0, MAX_INVITE_NAME_PART) : t
}

/** Combined display name stored on `User.name` when the invite is accepted. */
function inviteProfileNameFromRow(inv: { first_name: string; last_name: string }): string {
  const f = trimInviteNamePart(inv.first_name)
  const l = trimInviteNamePart(inv.last_name)
  return [f, l].filter(Boolean).join(' ')
}

const LINE_MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const

async function validateInviteLineManagerForCreate(
  orgId: string | null | undefined,
  managerId: string | undefined,
  role: string
): Promise<{ ok: true; managerId: string | null } | { ok: false; message: string }> {
  if (role !== 'EMPLOYEE') {
    return { ok: true, managerId: null }
  }
  if (!orgId) {
    return { ok: false, message: 'Organization context is required to invite an employee.' }
  }
  if (!managerId || typeof managerId !== 'string' || !managerId.trim()) {
    return { ok: false, message: 'Choose a line manager for employees.' }
  }
  const mgr = await prisma.user.findFirst({
    where: {
      id: managerId.trim(),
      org_id: orgId,
      status: 'ACTIVE',
      role: { in: [...LINE_MANAGER_ROLES] },
    },
    select: { id: true },
  })
  if (!mgr) {
    return {
      ok: false,
      message:
        'Invalid line manager. Pick an active owner, admin, or manager in your organization.',
    }
  }
  return { ok: true, managerId: mgr.id }
}

async function lineManagerStillValidForAccept(
  orgId: string,
  managerId: string | null,
  role: string
): Promise<boolean> {
  if (role !== 'EMPLOYEE' || !managerId) return true
  const mgr = await prisma.user.findFirst({
    where: {
      id: managerId,
      org_id: orgId,
      status: 'ACTIVE',
      role: { in: [...LINE_MANAGER_ROLES] },
    },
    select: { id: true },
  })
  return Boolean(mgr)
}

export async function inviteRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const authenticate = createAuthenticateMiddleware(config)

  fastify.post<{
    Body: {
      email: string
      role?: string
      first_name: string
      last_name: string
      manager_id?: string
    }
  }>(
    '/invite',
    {
      preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
      schema: {
        body: {
          type: 'object',
          required: ['email', 'first_name', 'last_name'],
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string' },
            first_name: { type: 'string', minLength: 1, maxLength: MAX_INVITE_NAME_PART },
            last_name: { type: 'string', minLength: 1, maxLength: MAX_INVITE_NAME_PART },
            manager_id: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          email: string
          role?: string
          first_name: string
          last_name: string
          manager_id?: string
        }
      }>,
      reply: FastifyReply
    ) => {
      const { email, role = 'EMPLOYEE', first_name, last_name, manager_id } = request.body
      const requester = (request as AuthenticatedRequest).user!
      const emailNorm = normalizeUserEmail(email)
      const fn = trimInviteNamePart(first_name)
      const ln = trimInviteNamePart(last_name)
      if (!fn || !ln) {
        return reply.status(400).send({
          code: 'INVALID_NAME',
          message: 'First name and last name are required.',
        })
      }

      // Privilege escalation prevention — callers can only invite roles below their own
      const allowedRoles = getAllowedInviteRoles(requester.role)
      if (!allowedRoles.includes(role)) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: `Your role cannot invite users with role ${role}. Allowed: ${allowedRoles.join(', ')}`,
        })
      }

      const lineManager = await validateInviteLineManagerForCreate(
        requester.org_id,
        manager_id,
        role
      )
      if (!lineManager.ok) {
        return reply.status(400).send({
          code: 'INVALID_MANAGER',
          message: lineManager.message,
        })
      }

      const registered = await findRegisteredUserByEmail(prisma, emailNorm)
      if (registered) {
        return reply.status(409).send({
          code: 'EMAIL_IN_USE',
          message: 'This email is already registered on TrackSync.',
        })
      }

      const inviteSlot = await isEmailAvailableForNewUser(prisma, emailNorm, {
        excludeOrgIdForInvite: requester.org_id ?? undefined,
      })
      if (!inviteSlot.ok && inviteSlot.reason === 'USER') {
        return reply.status(409).send({
          code: 'EMAIL_IN_USE',
          message: 'This email is already registered on TrackSync.',
        })
      }
      if (!inviteSlot.ok && inviteSlot.reason === 'INVITE_OTHER_ORG') {
        return reply.status(409).send({
          code: 'INVITE_EMAIL_TAKEN',
          message: 'This address already has a pending invitation from another organization.',
        })
      }

      const existingInvite = await prisma.invite.findFirst({
        where: {
          email: emailNorm,
          org_id: requester.org_id,
          accepted_at: null,
          expires_at: { gt: new Date() },
        },
      })
      if (existingInvite) {
        return reply.status(409).send({
          code: 'INVITE_EXISTS',
          message: 'An active invite already exists for this email',
        })
      }

      const invite = await prisma.invite.create({
        data: {
          org_id: requester.org_id,
          email: emailNorm,
          role: role as 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER',
          first_name: fn,
          last_name: ln,
          manager_id: lineManager.managerId,
          invited_by_id: requester.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        include: { organization: true },
      })

      void enqueueTransactionalEmail({
        kind: 'invite',
        to: invite.email,
        appUrl: config.APP_URL,
        inviterName: requester.name,
        workspaceName: invite.organization.name,
        inviteToken: invite.token,
      }).catch((err) => fastify.log.error({ err }, 'Failed to enqueue invite email'))

      return reply.status(201).send({ invite_id: invite.id, message: 'Invitation sent' })
    }
  )

  fastify.post<{
    Body: { token: string; password: string; full_name?: string }
  }>(
    '/invite/accept',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string' },
            /** @deprecated Optional; invitees set display name in the app after sign-in. */
            full_name: { type: 'string' },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { token: string; password: string; full_name?: string } }>,
      reply: FastifyReply
    ) => {
      const { token, password, full_name } = request.body
      const displayName = (full_name ?? '').trim()

      const invite = await prisma.invite.findUnique({
        where: { token },
        include: { organization: true },
      })

      if (!invite) {
        return reply.status(400).send({ code: 'INVALID_INVITE', message: 'Invite not found' })
      }

      if (invite.accepted_at) {
        return reply
          .status(400)
          .send({ code: 'INVITE_USED', message: 'This invite has already been accepted' })
      }

      if (invite.expires_at < new Date()) {
        return reply
          .status(400)
          .send({ code: 'INVITE_EXPIRED', message: 'This invite has expired' })
      }

      if ((invite.organization.status as string) === 'SUSPENDED') {
        return reply
          .status(402)
          .send({ code: 'ORG_SUSPENDED', message: 'Organization access has been suspended' })
      }

      const existingGlobal = await findRegisteredUserByEmail(prisma, invite.email)
      if (existingGlobal) {
        return reply.status(409).send({
          code: 'EMAIL_IN_USE',
          message: 'This email is already registered on TrackSync.',
        })
      }

      const managerOk = await lineManagerStillValidForAccept(
        invite.org_id,
        invite.manager_id,
        invite.role as string
      )
      if (!managerOk) {
        return reply.status(400).send({
          code: 'INVALID_INVITE',
          message:
            'This invite’s line manager is no longer available. Ask your admin to resend the invitation.',
        })
      }

      const password_hash = await hashPassword(password)

      const refreshToken = createRefreshToken()
      const tokenHash = hashRefreshToken(refreshToken)

      let user
      try {
        user = await prisma.$transaction(async (tx) => {
          const race = await findRegisteredUserByEmail(tx, invite.email)
          if (race) {
            throw Object.assign(new Error('EMAIL_IN_USE'), { code: 'EMAIL_IN_USE' as const })
          }
          const nameFromInvite = inviteProfileNameFromRow(invite)
          const resolvedName = nameFromInvite || displayName

          const newUser = await tx.user.create({
            data: {
              org_id: invite.org_id,
              email: invite.email,
              password_hash,
              name: resolvedName,
              role: invite.role as 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER',
              status: 'ACTIVE',
              manager_id:
                invite.role === 'EMPLOYEE' && invite.manager_id ? invite.manager_id : null,
              // The invite was delivered to this email address, so it's verified by acceptance.
              email_verified: true,
            },
          })
          await tx.invite.update({
            where: { id: invite.id },
            data: { accepted_at: new Date() },
          })
          await tx.refreshToken.create({
            data: {
              user_id: newUser.id,
              token_hash: tokenHash,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
          return newUser
        })
      } catch (err: unknown) {
        const o = err as { code?: string }
        if (o.code === 'EMAIL_IN_USE' || (o.code === 'P2002' && isPrismaUniqueOnUserEmail(err))) {
          return reply.status(409).send({
            code: 'EMAIL_IN_USE',
            message: 'This email is already registered on TrackSync.',
          })
        }
        throw err
      }

      const accessToken = await issueAccessToken(
        user.id,
        invite.org_id,
        user.role as string,
        user.role_version
      )

      return reply.status(201).send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          org_id: invite.org_id,
          org_name: invite.organization.name,
        },
      })
    }
  )

  fastify.get<{ Querystring: { token?: string } }>(
    '/invite/info',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
      const { token } = request.query
      if (!token) {
        return reply.status(400).send({ code: 'MISSING_TOKEN', message: 'Token is required' })
      }

      const invite = await prisma.invite.findUnique({
        where: { token },
        include: {
          organization: true,
          line_manager: { select: { id: true, name: true, email: true } },
        },
      })

      if (!invite || invite.accepted_at || invite.expires_at < new Date()) {
        return reply
          .status(400)
          .send({ code: 'INVALID_INVITE', message: 'Invite is invalid or expired' })
      }

      const display_name = inviteProfileNameFromRow(invite)
      const lm = invite.line_manager

      return reply.send({
        email: invite.email,
        org_name: invite.organization.name,
        role: invite.role,
        expires_at: invite.expires_at,
        first_name: invite.first_name,
        last_name: invite.last_name,
        display_name,
        line_manager: lm
          ? {
              id: lm.id,
              name: lm.name,
              email: lm.email,
            }
          : null,
      })
    }
  )
}
