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

      const [
        totalOrganizations,
        totalUsers,
        activeUsers7d,
        orgByStatus,
        orgByPlan,
        userByStatus,
        newOrgs7d,
        newUsers7d,
        recentOrgs,
      ] = await Promise.all([
        prisma.organization.count(),
        prisma.user.count(),
        prisma.user.count({
          where: { status: 'ACTIVE', updated_at: { gte: since } },
        }),
        prisma.organization.groupBy({ by: ['status'], _count: true }),
        prisma.organization.groupBy({ by: ['plan'], _count: true }),
        prisma.user.groupBy({ by: ['status'], _count: true }),
        prisma.organization.count({ where: { created_at: { gte: since } } }),
        prisma.user.count({ where: { created_at: { gte: since } } }),
        prisma.organization.findMany({
          take: 20,
          orderBy: { updated_at: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            created_at: true,
            updated_at: true,
            _count: { select: { users: true } },
          },
        }),
      ])

      const organizations_by_status: Record<string, number> = {}
      for (const row of orgByStatus) organizations_by_status[row.status] = row._count

      const organizations_by_plan: Record<string, number> = {}
      for (const row of orgByPlan) organizations_by_plan[row.plan] = row._count

      const users_by_status: Record<string, number> = {}
      for (const row of userByStatus) users_by_status[row.status] = row._count

      return {
        totals: {
          organizations: totalOrganizations,
          users: totalUsers,
          active_users_last_7_days: activeUsers7d,
          new_organizations_last_7_days: newOrgs7d,
          new_users_last_7_days: newUsers7d,
        },
        organizations_by_status,
        organizations_by_plan,
        users_by_status,
        recent_organizations: recentOrgs.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          status: o.status,
          user_count: o._count.users,
          created_at: o.created_at,
          last_active: o.updated_at,
        })),
      }
    },
  })
}
