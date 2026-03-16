import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDbRead } from '../../lib/db-read.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  user_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  project_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  group_by: z.enum(['day', 'week', 'project', 'user']).default('day'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function timeReportRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/time', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const canViewOthers = ['admin', 'super_admin', 'manager'].includes(user.role)
      const userIds = canViewOthers && query.user_id
        ? Array.isArray(query.user_id) ? query.user_id : [query.user_id]
        : [user.id]

      const projectIds = query.project_id
        ? Array.isArray(query.project_id) ? query.project_id : [query.project_id]
        : undefined

      const where = {
        org_id: user.org_id,
        user_id: { in: userIds },
        ended_at: { not: null },
        ...(projectIds && { project_id: { in: projectIds } }),
        ...(query.from || query.to
          ? {
              started_at: {
                ...(query.from && { gte: new Date(query.from) }),
                ...(query.to && { lte: new Date(query.to) }),
              },
            }
          : {}),
      }

      const [sessions, aggregate] = await Promise.all([
        db.timeSession.findMany({
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
        db.timeSession.aggregate({ where, _sum: { duration_sec: true } }),
      ])

      const total_seconds = aggregate._sum.duration_sec ?? 0

      // Build breakdown based on group_by
      let breakdown: Array<{ label: string; seconds: number; sessions: number }> = []

      if (query.group_by === 'day') {
        const dayMap = new Map<string, { seconds: number; sessions: number }>()
        for (const s of sessions) {
          const day = s.started_at.toISOString().split('T')[0]
          const existing = dayMap.get(day) ?? { seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          dayMap.set(day, existing)
        }
        breakdown = [...dayMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, v]) => ({ label, ...v }))
      } else if (query.group_by === 'project') {
        const projMap = new Map<string, { name: string; seconds: number; sessions: number }>()
        for (const s of sessions) {
          const key = s.project_id ?? 'no-project'
          const name = s.project?.name ?? 'No project'
          const existing = projMap.get(key) ?? { name, seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          projMap.set(key, existing)
        }
        breakdown = [...projMap.values()]
          .sort((a, b) => b.seconds - a.seconds)
          .map(({ name, seconds, sessions: sc }) => ({ label: name, seconds, sessions: sc }))
      } else if (query.group_by === 'user') {
        const userMap = new Map<string, { name: string; seconds: number; sessions: number }>()
        for (const s of sessions) {
          const key = s.user_id
          const name = s.user?.name ?? 'Unknown'
          const existing = userMap.get(key) ?? { name, seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          userMap.set(key, existing)
        }
        breakdown = [...userMap.values()]
          .sort((a, b) => b.seconds - a.seconds)
          .map(({ name, seconds, sessions: sc }) => ({ label: name, seconds, sessions: sc }))
      }

      return {
        total_seconds,
        breakdown,
        sessions: query.group_by === 'day' ? sessions : [],
        page: query.page,
        limit: query.limit,
      }
    },
  })
}
