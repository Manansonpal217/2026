import type { FastifyInstance } from 'fastify'
import { subDays } from 'date-fns'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function adminAnalyticsRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/analytics', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const orgId = req.user!.org_id
      const viewer = req.user!
      const excludeHiddenSuperAdmins = viewer.role !== 'OWNER'
      const hiddenUserWhere = excludeHiddenSuperAdmins ? { role: { not: 'OWNER' as const } } : {}
      const since = subDays(new Date(), 7)

      const startUtc = new Date()
      startUtc.setUTCHours(0, 0, 0, 0)

      const [totalUsers, statusGroups, newUsers7d, sessionsStartedTodayUtc] = await Promise.all([
        prisma.user.count({ where: { org_id: orgId, ...hiddenUserWhere } }),
        prisma.user.groupBy({
          by: ['status'],
          where: { org_id: orgId, ...hiddenUserWhere },
          _count: true,
        }),
        prisma.user.count({
          where: { org_id: orgId, created_at: { gte: since }, ...hiddenUserWhere },
        }),
        prisma.timeSession.count({
          where: {
            org_id: orgId,
            started_at: { gte: startUtc },
            ...(excludeHiddenSuperAdmins ? { user: { is: { role: { not: 'OWNER' } } } } : {}),
          },
        }),
      ])

      const users_by_status: Record<string, number> = {}
      for (const row of statusGroups) {
        users_by_status[row.status] = row._count
      }

      return {
        totals: {
          users: totalUsers,
          new_users_last_7_days: newUsers7d,
          time_sessions_started_today_utc: sessionsStartedTodayUtc,
        },
        users_by_status,
      }
    },
  })
}
