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

export async function attendanceDailyLogRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/attendance/daily-log', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const query = z
        .object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          user_ids: z.string().optional(),
          status: z.enum(['MET', 'SHORT', 'ABSENT']).optional(),
        })
        .parse(request.query)

      const from = new Date(query.from + 'T00:00:00Z')
      const to = new Date(query.to + 'T23:59:59.999Z')

      const requestedIds = parseIds(query.user_ids)
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (!userIds) return

      // Get expected daily work minutes from org settings
      const orgSettings = await db.orgSettings.findUnique({
        where: { org_id: user.org_id },
      })
      const expectedDailySeconds = (orgSettings?.expected_daily_work_minutes ?? 480) * 60

      // Get session data grouped by user and day
      const sessionRows = await db.$queryRaw<
        Array<{
          user_id: string
          work_date: string
          first_session_start: Date | null
          last_session_end: Date | null
          total_tracked_seconds: bigint
        }>
      >(Prisma.sql`
        SELECT
          ts.user_id,
          DATE(ts.started_at AT TIME ZONE 'UTC') AS work_date,
          MIN(ts.started_at) AS first_session_start,
          MAX(ts.ended_at) AS last_session_end,
          COALESCE(SUM(ts.duration_sec), 0)::bigint AS total_tracked_seconds
        FROM "TimeSession" ts
        WHERE ts.org_id = ${user.org_id}
          AND ts.user_id = ANY(${userIds}::text[])
          AND ts.started_at >= ${from}
          AND ts.started_at <= ${to}
          AND ts.approval_status != 'REJECTED'
        GROUP BY ts.user_id, DATE(ts.started_at AT TIME ZONE 'UTC')
      `)

      // Get approved offline time grouped by user and day
      const offlineRows = await db.$queryRaw<
        Array<{
          user_id: string
          work_date: string
          offline_seconds: bigint
        }>
      >(Prisma.sql`
        SELECT
          ot.user_id,
          DATE(ot.start_time AT TIME ZONE 'UTC') AS work_date,
          COALESCE(SUM(EXTRACT(EPOCH FROM (ot.end_time - ot.start_time)))::bigint, 0) AS offline_seconds
        FROM "OfflineTime" ot
        WHERE ot.org_id = ${user.org_id}
          AND ot.user_id = ANY(${userIds}::text[])
          AND ot.start_time >= ${from}
          AND ot.start_time <= ${to}
          AND ot.status = 'APPROVED'
        GROUP BY ot.user_id, DATE(ot.start_time AT TIME ZONE 'UTC')
      `)

      // Get user names
      const users = await db.user.findMany({
        where: { id: { in: userIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userMap = new Map(users.map((u) => [u.id, u.name]))

      // Build offline lookup
      const offlineMap = new Map<string, number>()
      for (const row of offlineRows) {
        const key = `${row.user_id}:${row.work_date}`
        offlineMap.set(key, Number(row.offline_seconds))
      }

      // Build result
      const data: Array<{
        user_id: string
        user_name: string
        date: string
        first_session_start: Date | null
        last_session_end: Date | null
        total_tracked_seconds: number
        expected_seconds: number
        delta: number
        status: 'MET' | 'SHORT' | 'ABSENT'
      }> = []

      // Generate all calendar days in range per user
      const startDate = new Date(query.from + 'T00:00:00Z')
      const endDate = new Date(query.to + 'T00:00:00Z')

      // Build session lookup
      const sessionMap = new Map<string, (typeof sessionRows)[number]>()
      for (const row of sessionRows) {
        const key = `${row.user_id}:${row.work_date}`
        sessionMap.set(key, row)
      }

      for (const uid of userIds) {
        const d = new Date(startDate)
        while (d <= endDate) {
          const dateStr = d.toISOString().slice(0, 10)
          const key = `${uid}:${dateStr}`
          const session = sessionMap.get(key)
          const offlineSec = offlineMap.get(key) ?? 0
          const trackedSec = session ? Number(session.total_tracked_seconds) : 0
          const totalSec = trackedSec + offlineSec
          const delta = totalSec - expectedDailySeconds

          let status: 'MET' | 'SHORT' | 'ABSENT'
          if (totalSec === 0) {
            status = 'ABSENT'
          } else if (totalSec >= expectedDailySeconds * 0.9) {
            status = 'MET'
          } else {
            status = 'SHORT'
          }

          if (!query.status || query.status === status) {
            data.push({
              user_id: uid,
              user_name: userMap.get(uid) ?? '',
              date: dateStr,
              first_session_start: session?.first_session_start ?? null,
              last_session_end: session?.last_session_end ?? null,
              total_tracked_seconds: totalSec,
              expected_seconds: expectedDailySeconds,
              delta,
              status,
            })
          }

          d.setUTCDate(d.getUTCDate() + 1)
        }
      }

      return reply.send({
        data,
        meta: reportMeta(from, to, data.length),
      })
    },
  })
}
