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
import {
  resolveUserIds,
  parseIds,
  reportMeta,
  idleScoreThresholdFromMinutes,
} from '../../../lib/report-helpers.js'

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  user_ids: z.string().optional(),
  idle_threshold_minutes: z.coerce.number().int().min(1).max(240).optional(),
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
      const { from, to } = query
      const orgId = user.org_id

      const orgSettings = await db.orgSettings.findUnique({
        where: { org_id: orgId },
        select: { idle_timeout_minutes: true },
      })
      const idleMinutes = query.idle_threshold_minutes ?? orgSettings?.idle_timeout_minutes ?? 5
      const idleScoreMax = idleScoreThresholdFromMinutes(idleMinutes)

      const requestedIds = query.user_ids ? parseIds(query.user_ids) : undefined
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (userIds === null) return

      const userIdFilter =
        userIds.length > 0 ? Prisma.sql`AND al.user_id IN (${Prisma.join(userIds)})` : Prisma.empty

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
            CASE WHEN al.activity_score < ${idleScoreMax} THEN 1 ELSE 0 END AS is_idle,
            ROW_NUMBER() OVER (PARTITION BY al.user_id, DATE(al.window_start) ORDER BY al.window_start)
              - ROW_NUMBER() OVER (PARTITION BY al.user_id, DATE(al.window_start), CASE WHEN al.activity_score < ${idleScoreMax} THEN 1 ELSE 0 END ORDER BY al.window_start) AS streak_group
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

      const byUser = new Map<
        string,
        {
          total_idle_sec: number
          day_count: number
          longest_idle_sec: number
          idle_percent_sum: number
        }
      >()

      for (const r of results) {
        const uid = r.user_id
        const cur = byUser.get(uid) ?? {
          total_idle_sec: 0,
          day_count: 0,
          longest_idle_sec: 0,
          idle_percent_sum: 0,
        }
        cur.total_idle_sec += Number(r.total_idle_seconds)
        cur.day_count += 1
        cur.longest_idle_sec = Math.max(cur.longest_idle_sec, Number(r.longest_idle_streak_seconds))
        cur.idle_percent_sum += r.idle_percent
        byUser.set(uid, cur)
      }

      const ids = [...byUser.keys()]
      const names =
        ids.length > 0
          ? await db.user.findMany({
              where: { id: { in: ids }, org_id: orgId },
              select: { id: true, name: true },
            })
          : []
      const nameById = new Map(names.map((u) => [u.id, u.name]))

      const users = ids.map((id) => {
        const u = byUser.get(id)!
        const avgIdle = u.day_count > 0 ? u.total_idle_sec / u.day_count : 0
        return {
          user_id: id,
          user_name: nameById.get(id) ?? 'Unknown',
          total_idle_sec: u.total_idle_sec,
          idle_sessions: u.day_count,
          avg_idle_sec: avgIdle,
          longest_idle_sec: u.longest_idle_sec,
          avg_idle_percent:
            u.day_count > 0 ? Math.round((u.idle_percent_sum / u.day_count) * 100) / 100 : 0,
        }
      })

      const data = {
        users,
        idle_threshold_minutes_used: idleMinutes,
        idle_score_threshold_used: idleScoreMax,
      }

      return { data, meta: reportMeta(from, to, users.length) }
    },
  })
}
