import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getDbRead } from '../../../lib/db-read.js'
import {
  createAuthenticateMiddleware,
  requirePermission,
} from '../../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../../middleware/authenticate.js'
import type { Config } from '../../../config.js'
import { Permission } from '../../../lib/permissions.js'
import { resolveUserIds, parseIds, reportMeta } from '../../../lib/report-helpers.js'

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  user_ids: z.string().optional(),
})

export async function productivityStreaksRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/productivity/streaks', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const query = querySchema.parse(req.query)
      const { from, to } = query
      const orgId = user.org_id

      const requestedIds = query.user_ids ? parseIds(query.user_ids) : undefined
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (userIds === null) return

      const userIdFilter =
        userIds.length > 0 ? Prisma.sql`AND u.id IN (${Prisma.join(userIds)})` : Prisma.empty

      const totalDaysInRange = Math.max(
        1,
        Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1
      )

      const results = await db.$queryRaw<
        Array<{
          user_id: string
          user_name: string
          current_streak: number | null
          longest_streak: number | null
          last_active_date: Date | null
          active_days_in_range: bigint
        }>
      >(Prisma.sql`
        SELECT
          u.id AS user_id,
          u.name AS user_name,
          s.current_streak,
          s.longest_streak,
          s.last_active_date,
          (
            SELECT COUNT(DISTINCT DATE(ts.started_at))
            FROM "TimeSession" ts
            WHERE ts.org_id = ${orgId}
              AND ts.user_id = u.id
              AND ts.started_at >= ${from}
              AND ts.ended_at <= ${to}
          ) AS active_days_in_range
        FROM "User" u
        LEFT JOIN "Streak" s ON s.user_id = u.id
        WHERE u.org_id = ${orgId}
          ${userIdFilter}
        ORDER BY s.current_streak DESC NULLS LAST
      `)

      const data = results.map((r) => {
        const activeDays = Number(r.active_days_in_range)
        return {
          user_id: r.user_id,
          user_name: r.user_name,
          current_streak: r.current_streak ?? 0,
          longest_streak: r.longest_streak ?? 0,
          last_active_date: r.last_active_date,
          active_days_in_range: activeDays,
          missed_days: totalDaysInRange - activeDays,
          total_days_in_range: totalDaysInRange,
        }
      })

      return { data, meta: reportMeta(from, to, data.length) }
    },
  })
}
