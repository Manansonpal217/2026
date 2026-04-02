import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { getDbRead } from '../../lib/db-read.js'
import { createAuthenticateMiddleware, requirePermission } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { canAccessOrgUser, mayActAsPeopleManager, Permission } from '../../lib/permissions.js'

const querySchema = z.object({
  user_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export async function activityReportRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/activity', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      if (query.user_id && query.user_id !== user.id && !mayActAsPeopleManager(user.role)) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const targetUserId =
        query.user_id && mayActAsPeopleManager(user.role) ? query.user_id : user.id

      if (query.user_id && query.user_id !== user.id) {
        if (!(await canAccessOrgUser(user, query.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
      }

      const exists = await prisma.user.findFirst({
        where: { id: targetUserId, org_id: user.org_id },
        select: { id: true },
      })
      if (!exists) {
        return reply.status(400).send({
          code: 'INVALID_USER',
          message: `User ${targetUserId} not found in your organization`,
        })
      }

      const where = {
        org_id: user.org_id,
        user_id: targetUserId,
        ...(query.from || query.to
          ? {
              window_start: {
                ...(query.from && { gte: new Date(query.from) }),
                ...(query.to && { lte: new Date(query.to) }),
              },
            }
          : {}),
      }

      const [activity_logs, total] = await Promise.all([
        db.activityLog.findMany({
          where,
          orderBy: { window_start: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            window_start: true,
            window_end: true,
            keyboard_events: true,
            mouse_clicks: true,
            mouse_distance_px: true,
            active_app: true,
            activity_score: true,
          },
        }),
        db.activityLog.count({ where }),
      ])

      return { activity_logs, total, page: query.page, limit: query.limit }
    },
  })
}
