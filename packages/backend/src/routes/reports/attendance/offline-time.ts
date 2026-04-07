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

export async function attendanceOfflineTimeRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/attendance/offline-time', {
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
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
        })
        .parse(request.query)

      const from = new Date(query.from + 'T00:00:00Z')
      const to = new Date(query.to + 'T23:59:59.999Z')

      const requestedIds = parseIds(query.user_ids)
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (!userIds) return

      // Build where conditions
      const statusFilter = query.status ? Prisma.sql`AND ot.status = ${query.status}` : Prisma.empty

      const entries = await db.$queryRaw<
        Array<{
          id: string
          user_id: string
          user_name: string
          source: string
          status: string
          start_time: Date
          end_time: Date
          duration_seconds: number
          description: string | null
          approver_id: string | null
          approver_name: string | null
          approver_note: string | null
          expires_at: Date | null
          created_at: Date
        }>
      >(Prisma.sql`
        SELECT
          ot.id,
          ot.user_id,
          u.name AS user_name,
          ot.source,
          ot.status,
          ot.start_time,
          ot.end_time,
          EXTRACT(EPOCH FROM (ot.end_time - ot.start_time))::int AS duration_seconds,
          ot.description,
          ot.approver_id,
          approver.name AS approver_name,
          ot.approver_note,
          ot.expires_at,
          ot.created_at
        FROM "OfflineTime" ot
        JOIN "User" u ON u.id = ot.user_id
        LEFT JOIN "User" approver ON approver.id = ot.approver_id
        WHERE ot.org_id = ${user.org_id}
          AND ot.user_id = ANY(${userIds}::text[])
          AND ot.start_time >= ${from}
          AND ot.start_time <= ${to}
          ${statusFilter}
        ORDER BY ot.start_time DESC
      `)

      // Compute summary stats
      let totalApprovedSeconds = 0
      let totalPendingCount = 0
      let totalRejectedCount = 0
      const totalCount = entries.length

      for (const e of entries) {
        if (e.status === 'APPROVED') {
          totalApprovedSeconds += e.duration_seconds
        } else if (e.status === 'PENDING') {
          totalPendingCount++
        } else if (e.status === 'REJECTED') {
          totalRejectedCount++
        }
      }

      const rejectionRate =
        totalCount > 0 ? Math.round((totalRejectedCount / totalCount) * 10000) / 100 : 0

      return reply.send({
        data: {
          entries,
          summary: {
            total_approved_seconds: totalApprovedSeconds,
            total_pending_count: totalPendingCount,
            rejection_rate: rejectionRate,
          },
        },
        meta: reportMeta(from, to, entries.length),
      })
    },
  })
}
