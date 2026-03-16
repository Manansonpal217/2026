import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  user_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function sessionListRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      // Role-based access: employees see only their own sessions
      const canViewOthers = ['admin', 'super_admin', 'manager'].includes(user.role)
      const targetUserId =
        canViewOthers && query.user_id ? query.user_id : user.id

      const where = {
        org_id: user.org_id,
        user_id: targetUserId,
        ...(query.project_id && { project_id: query.project_id }),
        ...(query.from || query.to
          ? {
              started_at: {
                ...(query.from && { gte: new Date(query.from) }),
                ...(query.to && { lte: new Date(query.to) }),
              },
            }
          : {}),
      }

      const [sessions, total, aggregate] = await Promise.all([
        prisma.timeSession.findMany({
          where,
          orderBy: { started_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            project: { select: { id: true, name: true, color: true } },
            task: { select: { id: true, name: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.timeSession.count({ where }),
        prisma.timeSession.aggregate({ where, _sum: { duration_sec: true } }),
      ])

      const total_seconds = aggregate._sum.duration_sec ?? 0

      return { sessions, total, total_seconds, page: query.page, limit: query.limit }
    },
  })
}
