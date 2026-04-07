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
  idle_threshold_minutes: z.coerce.number().int().min(1).default(5),
})

export async function productivityIdleTimeRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/productivity/idle-time', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const query = querySchema.parse(req.query)
      const { from, to, idle_threshold_minutes } = query
      const orgId = user.org_id

      const requestedIds = query.user_ids ? parseIds(query.user_ids) : undefined
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (userIds === null) return

      const userIdFilter =
        userIds.length > 0 ? Prisma.sql`AND al.user_id IN (${Prisma.join(userIds)})` : Prisma.empty

      const _ = idle_threshold_minutes // used for context; idle defined as activity_score < 10

      const results = await db.$queryRaw<
        Array<{
          user_id: string
          date: string
          total_idle_seconds: bigint
          total_active_seconds: bigint
          idle_percent: number
          longest_idle_streak_seconds: bigint
        }>
      >(Prisma.sql`
        WITH windows AS (
          SELECT
            al.user_id,
            DATE(al.window_start) AS date,
            EXTRACT(EPOCH FROM (al.window_end - al.window_start)) AS window_seconds,
            al.activity_score,
            al.window_start,
            CASE WHEN al.activity_score < 10 THEN 1 ELSE 0 END AS is_idle,
            ROW_NUMBER() OVER (PARTITION BY al.user_id, DATE(al.window_start) ORDER BY al.window_start)
              - ROW_NUMBER() OVER (PARTITION BY al.user_id, DATE(al.window_start), CASE WHEN al.activity_score < 10 THEN 1 ELSE 0 END ORDER BY al.window_start) AS streak_group
          FROM "ActivityLog" al
          WHERE al.org_id = ${orgId}
            AND al.window_start >= ${from}
            AND al.window_start <= ${to}
            ${userIdFilter}
        ),
        idle_streaks AS (
          SELECT
            user_id,
            date,
            streak_group,
            SUM(window_seconds) AS streak_seconds
          FROM windows
          WHERE is_idle = 1
          GROUP BY user_id, date, streak_group
        ),
        daily AS (
          SELECT
            w.user_id,
            w.date,
            COALESCE(SUM(w.window_seconds) FILTER (WHERE w.is_idle = 1), 0)::bigint AS total_idle_seconds,
            COALESCE(SUM(w.window_seconds) FILTER (WHERE w.is_idle = 0), 0)::bigint AS total_active_seconds,
            CASE
              WHEN SUM(w.window_seconds) = 0 THEN 0
              ELSE (SUM(w.window_seconds) FILTER (WHERE w.is_idle = 1) / SUM(w.window_seconds) * 100)
            END AS idle_percent
          FROM windows w
          GROUP BY w.user_id, w.date
        )
        SELECT
          d.user_id,
          d.date::text,
          d.total_idle_seconds,
          d.total_active_seconds,
          d.idle_percent,
          COALESCE((SELECT MAX(is2.streak_seconds)::bigint FROM idle_streaks is2 WHERE is2.user_id = d.user_id AND is2.date = d.date), 0) AS longest_idle_streak_seconds
        FROM daily d
        ORDER BY d.user_id, d.date
      `)

      const data = results.map((r) => ({
        user_id: r.user_id,
        date: r.date,
        total_idle_seconds: Number(r.total_idle_seconds),
        total_active_seconds: Number(r.total_active_seconds),
        idle_percent: Math.round(r.idle_percent * 100) / 100,
        longest_idle_streak_seconds: Number(r.longest_idle_streak_seconds),
      }))

      return { data, meta: reportMeta(from, to, data.length) }
    },
  })
}
