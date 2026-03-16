import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { logAuditEvent } from '../../lib/audit.js'

const adminEditSchema = z.object({
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  project_id: z.string().uuid().nullable().optional(),
  task_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function sessionAdminEditRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.patch('/:id/admin-edit', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const body = adminEditSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const session = await prisma.timeSession.findFirst({
        where: { id, org_id: user.org_id },
      })
      if (!session) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' })
      }

      const startedAt = body.data.started_at ? new Date(body.data.started_at) : session.started_at
      const endedAt = body.data.ended_at
        ? new Date(body.data.ended_at)
        : session.ended_at

      // Validation
      if (startedAt > new Date()) {
        return reply.status(400).send({ code: 'INVALID_TIME', message: 'started_at cannot be in the future' })
      }
      if (endedAt && endedAt <= startedAt) {
        return reply.status(400).send({ code: 'INVALID_TIME', message: 'ended_at must be after started_at' })
      }

      const durationSec = endedAt
        ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
        : session.duration_sec

      const oldValue = {
        started_at: session.started_at,
        ended_at: session.ended_at,
        project_id: session.project_id,
        task_id: session.task_id,
        notes: session.notes,
        duration_sec: session.duration_sec,
      }

      const updated = await prisma.timeSession.update({
        where: { id },
        data: {
          ...(body.data.started_at && { started_at: startedAt }),
          ...(body.data.ended_at && { ended_at: endedAt }),
          ...(body.data.project_id !== undefined && { project_id: body.data.project_id }),
          ...(body.data.task_id !== undefined && { task_id: body.data.task_id }),
          ...(body.data.notes !== undefined && { notes: body.data.notes }),
          duration_sec: durationSec,
        },
      })

      await logAuditEvent({
        orgId: user.org_id,
        actorId: user.id,
        action: 'session.edited',
        targetType: 'session',
        targetId: id,
        oldValue,
        newValue: {
          started_at: updated.started_at,
          ended_at: updated.ended_at,
          project_id: updated.project_id,
          task_id: updated.task_id,
          notes: updated.notes,
          duration_sec: updated.duration_sec,
        },
        ip: request.ip,
      })

      return { session: updated }
    },
  })
}
