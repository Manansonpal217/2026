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

function countWeekdays(start: Date, end: Date): number {
  let count = 0
  const d = new Date(start)
  while (d <= end) {
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

function getWeekLabel(date: Date): string {
  // ISO week: find Monday of the week
  const d = new Date(date)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().slice(0, 10)
}

function getMonthLabel(date: Date): string {
  return date.toISOString().slice(0, 7)
}

export async function attendanceOvertimeRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/attendance/overtime', {
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
          group_by: z.enum(['week', 'month']).default('week'),
        })
        .parse(request.query)

      const from = new Date(query.from + 'T00:00:00Z')
      const to = new Date(query.to + 'T23:59:59.999Z')

      const requestedIds = parseIds(query.user_ids)
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (!userIds) return

      const orgSettings = await db.orgSettings.findUnique({
        where: { org_id: user.org_id },
      })
      const expectedDailySeconds = (orgSettings?.expected_daily_work_minutes ?? 480) * 60

      const users = await db.user.findMany({
        where: { id: { in: userIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userMap = new Map(users.map((u) => [u.id, u.name]))

      // Get daily totals per user
      const dailyRows = await db.$queryRaw<
        Array<{
          user_id: string
          work_date: string
          total_seconds: bigint
        }>
      >(Prisma.sql`
        SELECT
          ts.user_id,
          DATE(ts.started_at AT TIME ZONE 'UTC') AS work_date,
          COALESCE(SUM(ts.duration_sec), 0)::bigint AS total_seconds
        FROM "TimeSession" ts
        WHERE ts.org_id = ${user.org_id}
          AND ts.user_id = ANY(${userIds}::text[])
          AND ts.started_at >= ${from}
          AND ts.started_at <= ${to}
          AND ts.approval_status != 'REJECTED'
        GROUP BY ts.user_id, DATE(ts.started_at AT TIME ZONE 'UTC')
      `)

      // Group by user and period
      const getPeriodLabel = query.group_by === 'week' ? getWeekLabel : getMonthLabel

      // Accumulate per user per period
      const periodData = new Map<string, { actual: number; dates: Date[] }>()

      for (const row of dailyRows) {
        const date = new Date(row.work_date + 'T00:00:00Z')
        const periodLabel = getPeriodLabel(date)
        const key = `${row.user_id}:${periodLabel}`
        const existing = periodData.get(key) ?? { actual: 0, dates: [] }
        existing.actual += Number(row.total_seconds)
        existing.dates.push(date)
        periodData.set(key, existing)
      }

      // Also generate periods for all days in range to get working day counts
      const allPeriods = new Map<string, { start: Date; end: Date }>()
      const d = new Date(from)
      const endDate = new Date(query.to + 'T00:00:00Z')
      while (d <= endDate) {
        const label = getPeriodLabel(d)
        const existing = allPeriods.get(label)
        if (!existing) {
          allPeriods.set(label, { start: new Date(d), end: new Date(d) })
        } else {
          if (d < existing.start) existing.start = new Date(d)
          if (d > existing.end) existing.end = new Date(d)
        }
        d.setUTCDate(d.getUTCDate() + 1)
      }

      // Compute working days per period (clamped to from/to range)
      const periodWorkingDays = new Map<string, number>()
      for (const [label, range] of allPeriods) {
        const clampedStart = range.start < from ? from : range.start
        const clampedEnd = range.end > endDate ? endDate : range.end
        periodWorkingDays.set(label, countWeekdays(clampedStart, clampedEnd))
      }

      // Build output sorted by user and period
      const data: Array<{
        user_id: string
        user_name: string
        period_label: string
        expected_seconds: number
        actual_seconds: number
        delta: number
        cumulative_delta: number
      }> = []

      for (const uid of userIds) {
        const sortedPeriods = Array.from(allPeriods.keys()).sort()
        let cumulativeDelta = 0

        for (const periodLabel of sortedPeriods) {
          const key = `${uid}:${periodLabel}`
          const pd = periodData.get(key)
          const actualSeconds = pd?.actual ?? 0
          const workingDays = periodWorkingDays.get(periodLabel) ?? 0
          const expectedSeconds = expectedDailySeconds * workingDays
          const delta = actualSeconds - expectedSeconds
          cumulativeDelta += delta

          data.push({
            user_id: uid,
            user_name: userMap.get(uid) ?? '',
            period_label: periodLabel,
            expected_seconds: expectedSeconds,
            actual_seconds: actualSeconds,
            delta,
            cumulative_delta: cumulativeDelta,
          })
        }
      }

      return reply.send({
        data,
        meta: reportMeta(from, to, data.length),
      })
    },
  })
}
