import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { canAccessOrgUser, managerScopedUserIds } from '../../lib/permissions.js'
import { logAuditEvent } from '../../lib/audit.js'

const approveSchema = z.object({ notes: z.string().max(1000).optional() })
const rejectSchema = z.object({ reason: z.string().min(1).max(1000) })
const listQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export async function sessionApproveRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/pending-approval', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      let userFilter: { user_id?: string | { in: string[] } } = {}
      if (user.role === 'MANAGER') {
        const scoped = await managerScopedUserIds(user)
        if (query.user_id) {
          if (!scoped.includes(query.user_id)) {
            return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
          }
          userFilter = { user_id: query.user_id }
        } else {
          userFilter = { user_id: { in: scoped } }
        }
      } else if (query.user_id) {
        if (!(await canAccessOrgUser(user, query.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        userFilter = { user_id: query.user_id }
      }

      const where = {
        org_id: user.org_id,
        approval_status: 'PENDING' as const,
        ended_at: { not: null },
        ...userFilter,
        ...(query.project_id && { project_id: query.project_id }),
        ...(user.role !== 'OWNER' ? { user: { is: { role: { not: 'OWNER' as const } } } } : {}),
      }

      const [sessions, total] = await Promise.all([
        prisma.timeSession.findMany({
          where,
          orderBy: { started_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            user: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true, color: true } },
            task: { select: { id: true, name: true } },
          },
        }),
        prisma.timeSession.count({ where }),
      ])

      return { sessions, total, page: query.page, limit: query.limit }
    },
  })

  fastify.post('/:id/approve', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const body = approveSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const session = await prisma.timeSession.findFirst({
        where: { id, org_id: user.org_id, approval_status: 'PENDING' },
      })
      if (!session) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Pending session not found' })
      }

      if (!(await canAccessOrgUser(user, session.user_id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const oldValue = { approval_status: session.approval_status }
      const updated = await prisma.timeSession.update({
        where: { id },
        data: { approval_status: 'APPROVED', ...(body.data.notes && { notes: body.data.notes }) },
      })

      await logAuditEvent({
        orgId: user.org_id,
        actorId: user.id,
        action: 'session.approved',
        targetType: 'session',
        targetId: id,
        oldValue,
        newValue: { approval_status: 'APPROVED' },
        ip: request.ip,
      })

      const { getTimeLogPushQueue } = await import('../../queues/index.js')
      const pushQueue = getTimeLogPushQueue()
      await pushQueue.add(
        'push',
        { sessionId: id, orgId: user.org_id },
        { jobId: `tlp-${id}`, attempts: 3 }
      )

      return { session: updated }
    },
  })

  fastify.post('/:id/reject', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const body = rejectSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const session = await prisma.timeSession.findFirst({
        where: { id, org_id: user.org_id, approval_status: 'PENDING' },
        include: { user: { select: { email: true, name: true } } },
      })
      if (!session) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Pending session not found' })
      }

      if (!(await canAccessOrgUser(user, session.user_id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const oldValue = { approval_status: session.approval_status }
      const updated = await prisma.timeSession.update({
        where: { id },
        data: { approval_status: 'REJECTED' },
      })

      await logAuditEvent({
        orgId: user.org_id,
        actorId: user.id,
        action: 'session.rejected',
        targetType: 'session',
        targetId: id,
        oldValue,
        newValue: { approval_status: 'REJECTED', reason: body.data.reason },
        ip: request.ip,
      })

      // Notify employee by email
      const { sendEmail } = await import('../../lib/email.js')
      await sendEmail(opts.config, {
        to: session.user.email,
        subject: '[TrackSync] Your time session was rejected',
        text: `Your time session on ${session.started_at.toDateString()} was rejected.\n\nReason: ${body.data.reason}`,
      }).catch((e) => console.error('Reject notification email error:', e))

      return { session: updated }
    },
  })
}
