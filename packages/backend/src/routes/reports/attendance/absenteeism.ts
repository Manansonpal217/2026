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

export async function attendanceAbsenteeismRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/attendance/absenteeism', {
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

      const users = await db.user.findMany({
        where: { id: { in: userIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userMap = new Map(users.map((u) => [u.id, u.name]))

      // Get dates with sessions per user
      const sessionDates = await db.$queryRaw<
        Array<{
          user_id: string
          work_date: string
        }>
      >(Prisma.sql`
        SELECT DISTINCT
          ts.user_id,
          DATE(ts.started_at AT TIME ZONE 'UTC')::text AS work_date
        FROM "TimeSession" ts
        WHERE ts.org_id = ${user.org_id}
          AND ts.user_id = ANY(${userIds}::text[])
          AND ts.started_at >= ${from}
          AND ts.started_at <= ${to}
      `)

      // Get dates with approved offline time per user
      const offlineDates = await db.$queryRaw<
        Array<{
          user_id: string
          work_date: string
        }>
      >(Prisma.sql`
        SELECT DISTINCT
          ot.user_id,
          DATE(ot.start_time AT TIME ZONE 'UTC')::text AS work_date
        FROM "OfflineTime" ot
        WHERE ot.org_id = ${user.org_id}
          AND ot.user_id = ANY(${userIds}::text[])
          AND ot.start_time >= ${from}
          AND ot.start_time <= ${to}
          AND ot.status = 'APPROVED'
      `)

      // Build presence set per user
      const presenceSet = new Map<string, Set<string>>()
      for (const uid of userIds) {
        presenceSet.set(uid, new Set())
      }
      for (const row of sessionDates) {
        presenceSet.get(row.user_id)?.add(row.work_date)
      }
      for (const row of offlineDates) {
        presenceSet.get(row.user_id)?.add(row.work_date)
      }

      // Generate weekdays in range
      const startDate = new Date(query.from + 'T00:00:00Z')
      const endDate = new Date(query.to + 'T00:00:00Z')
      const weekdays: Array<{ dateStr: string; dayOfWeek: number }> = []
      const d = new Date(startDate)
      while (d <= endDate) {
        const dow = d.getUTCDay()
        if (dow >= 1 && dow <= 5) {
          weekdays.push({ dateStr: d.toISOString().slice(0, 10), dayOfWeek: dow })
        }
        d.setUTCDate(d.getUTCDate() + 1)
      }

      const totalWorkingDays = weekdays.length

      const data: Array<{
        user_id: string
        user_name: string
        absent_days: string[]
        absent_count: number
        total_working_days: number
        absent_rate: number
        pattern: Record<number, number>
      }> = []

      for (const uid of userIds) {
        const present = presenceSet.get(uid) ?? new Set()
        const absentDays: string[] = []
        const pattern: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }

        for (const wd of weekdays) {
          if (!present.has(wd.dateStr)) {
            absentDays.push(wd.dateStr)
            pattern[wd.dayOfWeek]++
          }
        }

        const absentRate =
          totalWorkingDays > 0
            ? Math.round((absentDays.length / totalWorkingDays) * 10000) / 100
            : 0

        data.push({
          user_id: uid,
          user_name: userMap.get(uid) ?? '',
          absent_days: absentDays,
          absent_count: absentDays.length,
          total_working_days: totalWorkingDays,
          absent_rate: absentRate,
          pattern,
        })
      }

      return reply.send({
        data,
        meta: reportMeta(from, to, data.length),
      })
    },
  })
}
