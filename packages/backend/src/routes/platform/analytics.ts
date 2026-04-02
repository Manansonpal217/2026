import type { FastifyInstance } from 'fastify'
import { subDays } from 'date-fns'
import { prisma } from '../../db/prisma.js'
import {
  createAuthenticateMiddleware,
  requirePlatformAdmin,
} from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function platformAnalyticsRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/analytics', {
    preHandler: [authenticate, requirePlatformAdmin()],
    handler: async () => {
      const since = subDays(new Date(), 7)

      const [totalOrganizations, totalUsers, orgByStatus, userByStatus, newOrgs7d, newUsers7d] =
        await Promise.all([
          prisma.organization.count(),
          prisma.user.count(),
          prisma.organization.groupBy({
            by: ['status'],
            _count: true,
          }),
          prisma.user.groupBy({
            by: ['status'],
            _count: true,
          }),
          prisma.organization.count({
            where: { created_at: { gte: since } },
          }),
          prisma.user.count({
            where: { created_at: { gte: since } },
          }),
        ])

      const organizations_by_status: Record<string, number> = {}
      for (const row of orgByStatus) {
        organizations_by_status[row.status] = row._count
      }

      const users_by_status: Record<string, number> = {}
      for (const row of userByStatus) {
        users_by_status[row.status] = row._count
      }

      return {
        totals: {
          organizations: totalOrganizations,
          users: totalUsers,
          new_organizations_last_7_days: newOrgs7d,
          new_users_last_7_days: newUsers7d,
        },
        organizations_by_status,
        users_by_status,
      }
    },
  })
}
