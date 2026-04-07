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
  team_id: z.string().uuid().optional(),
})

export async function productivitySummaryRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/productivity/summary', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const query = querySchema.parse(req.query)
      const from = query.from
      const to = query.to
      const orgId = user.org_id

      const requestedIds = query.user_ids ? parseIds(query.user_ids) : undefined
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (userIds === null) return

      const userIdFilter =
        userIds.length > 0 ? Prisma.sql`AND ts.user_id IN (${Prisma.join(userIds)})` : Prisma.empty

      const summaries = await db.$queryRaw<
        Array<{
          user_id: string
          total_tracked_seconds: bigint
          session_count: bigint
          screenshot_count: bigint
          avg_activity_score: number | null
          idle_percent: number | null
        }>
      >(Prisma.sql`
        SELECT
          ts.user_id,
          COALESCE(SUM(ts.duration_sec), 0) AS total_tracked_seconds,
          COUNT(DISTINCT ts.id) AS session_count,
          (SELECT COUNT(*) FROM "Screenshot" sc
            WHERE sc.org_id = ${orgId}
              AND sc.user_id = ts.user_id
              AND sc.taken_at >= ${from}
              AND sc.taken_at <= ${to}
              AND sc.deleted_at IS NULL
          ) AS screenshot_count,
          (SELECT AVG(al.activity_score) FROM "ActivityLog" al
            WHERE al.org_id = ${orgId}
              AND al.user_id = ts.user_id
              AND al.window_start >= ${from}
              AND al.window_start <= ${to}
          ) AS avg_activity_score,
          (SELECT
            CASE WHEN COUNT(*) = 0 THEN 0
            ELSE (COUNT(*) FILTER (WHERE al2.activity_score < 10))::float / COUNT(*)::float * 100
            END
           FROM "ActivityLog" al2
            WHERE al2.org_id = ${orgId}
              AND al2.user_id = ts.user_id
              AND al2.window_start >= ${from}
              AND al2.window_start <= ${to}
          ) AS idle_percent
        FROM "TimeSession" ts
        WHERE ts.org_id = ${orgId}
          AND ts.started_at >= ${from}
          AND ts.ended_at <= ${to}
          ${userIdFilter}
        GROUP BY ts.user_id
        ORDER BY avg_activity_score DESC NULLS LAST
      `)

      const dailyBreakdown = await db.$queryRaw<
        Array<{
          user_id: string
          date: string
          seconds: bigint
          avg_score: number | null
        }>
      >(Prisma.sql`
        SELECT
          ts.user_id,
          DATE(ts.started_at) AS date,
          COALESCE(SUM(ts.duration_sec), 0) AS seconds,
          (SELECT AVG(al.activity_score) FROM "ActivityLog" al
            WHERE al.org_id = ${orgId}
              AND al.user_id = ts.user_id
              AND DATE(al.window_start) = DATE(ts.started_at)
              AND al.window_start >= ${from}
              AND al.window_start <= ${to}
          ) AS avg_score
        FROM "TimeSession" ts
        WHERE ts.org_id = ${orgId}
          AND ts.started_at >= ${from}
          AND ts.ended_at <= ${to}
          ${userIdFilter}
        GROUP BY ts.user_id, DATE(ts.started_at)
        ORDER BY ts.user_id, date
      `)

      const dailyMap = new Map<
        string,
        Array<{ date: string; seconds: number; avg_score: number | null }>
      >()
      for (const row of dailyBreakdown) {
        const arr = dailyMap.get(row.user_id) ?? []
        arr.push({ date: row.date, seconds: Number(row.seconds), avg_score: row.avg_score })
        dailyMap.set(row.user_id, arr)
      }

      const data = summaries.map((s) => ({
        user_id: s.user_id,
        total_tracked_seconds: Number(s.total_tracked_seconds),
        avg_activity_score:
          s.avg_activity_score != null ? Math.round(s.avg_activity_score * 100) / 100 : null,
        idle_percent: s.idle_percent != null ? Math.round(s.idle_percent * 100) / 100 : null,
        screenshot_count: Number(s.screenshot_count),
        session_count: Number(s.session_count),
        daily_breakdown: dailyMap.get(s.user_id) ?? [],
      }))

      return { data, meta: reportMeta(from, to, data.length) }
    },
  })
}
