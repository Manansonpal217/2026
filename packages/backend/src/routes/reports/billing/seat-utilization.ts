import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDbRead } from '../../../lib/db-read.js'
import {
  createAuthenticateMiddleware,
  requirePermission,
} from '../../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../../middleware/authenticate.js'
import type { Config } from '../../../config.js'
import { Permission } from '../../../lib/permissions.js'
import { reportMeta } from '../../../lib/report-helpers.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
})

export async function billingSeatUtilizationRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/billing/seat-utilization', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { from, to } = parsed.data
      const fromDate = new Date(from)
      const toDate = new Date(to)

      // All non-suspended users
      const allUsers = await db.user.findMany({
        where: { org_id: user.org_id, status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
      })

      // Users with at least one session in the period
      const activeSessions = await db.timeSession.groupBy({
        by: ['user_id'],
        where: {
          org_id: user.org_id,
          started_at: { gte: fromDate, lte: toDate },
        },
      })
      const activeUserIds = new Set(activeSessions.map((s) => s.user_id))

      // For inactive users, find their last active date
      const inactiveUsers: Array<{
        id: string
        name: string
        email: string
        last_active: string | null
      }> = []
      for (const u of allUsers) {
        if (!activeUserIds.has(u.id)) {
          const lastSession = await db.timeSession.findFirst({
            where: { user_id: u.id, org_id: user.org_id },
            orderBy: { started_at: 'desc' },
            select: { started_at: true },
          })
          inactiveUsers.push({
            id: u.id,
            name: u.name,
            email: u.email,
            last_active: lastSession?.started_at?.toISOString() ?? null,
          })
        }
      }

      const totalSeats = allUsers.length
      const activeSeats = activeUserIds.size
      const inactiveSeats = totalSeats - activeSeats

      return {
        data: {
          total_seats: totalSeats,
          active_seats: activeSeats,
          inactive_seats: inactiveSeats,
          utilization_rate: totalSeats > 0 ? Math.round((activeSeats / totalSeats) * 100) : 0,
          inactive_users: inactiveUsers,
        },
        meta: reportMeta(from, to),
      }
    },
  })
}
