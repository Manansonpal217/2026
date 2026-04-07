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

export async function attendanceLateStartRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/attendance/late-start', {
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
        })
        .parse(request.query)

      const from = new Date(query.from + 'T00:00:00Z')
      const to = new Date(query.to + 'T23:59:59.999Z')

      const requestedIds = parseIds(query.user_ids)
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (!userIds) return

      // Get users
      const users = await db.user.findMany({
        where: { id: { in: userIds }, org_id: user.org_id },
        select: { id: true, name: true, timezone: true },
      })
      const userMap = new Map(users.map((u) => [u.id, u]))

      // Get work schedules: user-specific or org default
      const schedules = await db.$queryRaw<
        Array<{
          id: string
          user_id: string | null
          days_of_week: number[]
          start_time: string
          end_time: string
        }>
      >(Prisma.sql`
        SELECT id, user_id, days_of_week, start_time, end_time
        FROM "WorkSchedule"
        WHERE org_id = ${user.org_id}
          AND (user_id = ANY(${userIds}::text[]) OR user_id IS NULL)
      `)

      // Build schedule lookup: user-specific takes priority over org default
      const userScheduleMap = new Map<string, { days_of_week: number[]; start_time: string }>()
      const orgDefault = schedules.find((s) => s.user_id === null)

      for (const uid of userIds) {
        const specific = schedules.find((s) => s.user_id === uid)
        if (specific) {
          userScheduleMap.set(uid, {
            days_of_week: specific.days_of_week,
            start_time: specific.start_time,
          })
        } else if (orgDefault) {
          userScheduleMap.set(uid, {
            days_of_week: orgDefault.days_of_week,
            start_time: orgDefault.start_time,
          })
        }
      }

      // Get first session start per user per day
      const sessionRows = await db.$queryRaw<
        Array<{
          user_id: string
          work_date: string
          first_start: Date
        }>
      >(Prisma.sql`
        SELECT
          ts.user_id,
          DATE(ts.started_at AT TIME ZONE 'UTC') AS work_date,
          MIN(ts.started_at) AS first_start
        FROM "TimeSession" ts
        WHERE ts.org_id = ${user.org_id}
          AND ts.user_id = ANY(${userIds}::text[])
          AND ts.started_at >= ${from}
          AND ts.started_at <= ${to}
        GROUP BY ts.user_id, DATE(ts.started_at AT TIME ZONE 'UTC')
      `)

      const sessionMap = new Map<string, Date>()
      for (const row of sessionRows) {
        sessionMap.set(`${row.user_id}:${row.work_date}`, row.first_start)
      }

      const data: Array<{
        user_id: string
        user_name: string
        date: string
        actual_first_start: Date | null
        expected_start: string | null
        late_by_seconds: number | null
        has_schedule: boolean
      }> = []

      const startDate = new Date(query.from + 'T00:00:00Z')
      const endDate = new Date(query.to + 'T00:00:00Z')

      for (const uid of userIds) {
        const schedule = userScheduleMap.get(uid)
        const userName = userMap.get(uid)?.name ?? ''
        const d = new Date(startDate)

        while (d <= endDate) {
          const dateStr = d.toISOString().slice(0, 10)
          const dayOfWeek = d.getUTCDay() // 0=Sun
          const key = `${uid}:${dateStr}`
          const firstStart = sessionMap.get(key) ?? null

          if (!schedule) {
            data.push({
              user_id: uid,
              user_name: userName,
              date: dateStr,
              actual_first_start: firstStart,
              expected_start: null,
              late_by_seconds: null,
              has_schedule: false,
            })
          } else if (schedule.days_of_week.includes(dayOfWeek) && firstStart) {
            // Parse expected start time for this day
            const [hh, mm] = schedule.start_time.split(':').map(Number)
            const expectedDate = new Date(dateStr + 'T00:00:00Z')
            expectedDate.setUTCHours(hh, mm, 0, 0)

            const lateBy = Math.max(
              0,
              Math.floor((firstStart.getTime() - expectedDate.getTime()) / 1000)
            )

            data.push({
              user_id: uid,
              user_name: userName,
              date: dateStr,
              actual_first_start: firstStart,
              expected_start: schedule.start_time,
              late_by_seconds: lateBy,
              has_schedule: true,
            })
          } else if (schedule.days_of_week.includes(dayOfWeek)) {
            data.push({
              user_id: uid,
              user_name: userName,
              date: dateStr,
              actual_first_start: null,
              expected_start: schedule.start_time,
              late_by_seconds: null,
              has_schedule: true,
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
