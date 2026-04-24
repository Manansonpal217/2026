import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { enqueueTransactionalEmail } from '../../services/email/enqueue.js'
import { getAllowedInviteRoles } from '../../lib/permissions.js'

const listInvitesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['pending', 'accepted', 'expired']).optional(),
  search: z.string().optional(),
})

function deriveInviteStatus(invite: {
  accepted_at: Date | null
  expires_at: Date
}): 'pending' | 'accepted' | 'expired' {
  if (invite.accepted_at) return 'accepted'
  if (invite.expires_at < new Date()) return 'expired'
  return 'pending'
}

export async function adminInviteRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const authenticate = createAuthenticateMiddleware(config)

  /** List all invites for the org with derived status. */
  fastify.get('/invites', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const u = req.user!

      const parsed = listInvitesQuerySchema.safeParse(request.query)
      if (!parsed.success) return { invites: [], total: 0 }
      const query = parsed.data

      const where: Record<string, unknown> = { org_id: u.org_id }

      if (query.search) {
        where.email = { contains: query.search.toLowerCase(), mode: 'insensitive' as const }
      }

      // Fetch all matching invites first so we can filter by derived status
      const allInvites = await prisma.invite.findMany({
        where,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          first_name: true,
          last_name: true,
          manager_id: true,
          accepted_at: true,
          expires_at: true,
          created_at: true,
          invited_by: {
            select: { id: true, name: true, email: true },
          },
          line_manager: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      const withStatus = allInvites.map((inv) => ({
        ...inv,
        status: deriveInviteStatus(inv),
      }))

      const filtered = query.status
        ? withStatus.filter((inv) => inv.status === query.status)
        : withStatus

      const total = filtered.length
      const skip = (query.page - 1) * query.limit
      const page = filtered.slice(skip, skip + query.limit)

      return { invites: page, total }
    },
  })

  /** Revoke (delete) a pending invite. */
  fastify.delete<{ Params: { id: string } }>('/invites/:id', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const u = req.user!
      const { id } = (request as typeof request & { params: { id: string } }).params

      const invite = await prisma.invite.findFirst({
        where: { id, org_id: u.org_id },
      })
      if (!invite) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Invite not found' })
      }
      if (invite.accepted_at) {
        return reply
          .status(400)
          .send({ code: 'INVITE_USED', message: 'Cannot revoke an accepted invite' })
      }

      const allowedRoles = getAllowedInviteRoles(u.role)
      if (!allowedRoles.includes(invite.role)) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'You do not have permission to revoke this invite',
        })
      }

      await prisma.invite.delete({ where: { id } })
      return reply.status(200).send({ message: 'Invite revoked' })
    },
  })

  /** Resend / refresh an expired or pending invite. Creates a fresh invite record. */
  fastify.post<{ Params: { id: string } }>('/invites/:id/resend', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const u = req.user!
      const { id } = (request as typeof request & { params: { id: string } }).params

      const invite = await prisma.invite.findFirst({
        where: { id, org_id: u.org_id },
        include: { organization: true },
      })
      if (!invite) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Invite not found' })
      }
      if (invite.accepted_at) {
        return reply
          .status(400)
          .send({ code: 'INVITE_USED', message: 'This invite has already been accepted' })
      }

      // Privilege check — same as original invite creation
      const allowedRoles = getAllowedInviteRoles(u.role)
      if (!allowedRoles.includes(invite.role)) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resend this invite',
        })
      }

      // Delete old invite and create a fresh one (reset expiry)
      await prisma.invite.delete({ where: { id } })
      const newInvite = await prisma.invite.create({
        data: {
          org_id: u.org_id,
          email: invite.email,
          role: invite.role,
          first_name: invite.first_name,
          last_name: invite.last_name,
          manager_id: invite.manager_id,
          invited_by_id: u.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })

      void enqueueTransactionalEmail({
        kind: 'invite',
        to: newInvite.email,
        appUrl: config.APP_URL,
        inviterName: u.name,
        workspaceName: invite.organization.name,
        inviteToken: newInvite.token,
      }).catch((err) => fastify.log.error({ err }, 'Failed to enqueue resend invite email'))

      return reply.status(200).send({ invite_id: newInvite.id, message: 'Invitation resent' })
    },
  })
}
