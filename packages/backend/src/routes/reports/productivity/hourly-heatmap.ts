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
import { resolveUserIds, reportMeta } from '../../../lib/report-helpers.js'

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  user_id: z.string().uuid().optional(),
})

export async function productivityHourlyHeatmapRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/productivity/hourly-heatmap', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const query = querySchema.parse(req.query)
      const { from, to } = query
      const orgId = user.org_id

      // For MANAGER role, user_id is required; for ADMIN/OWNER it's optional
      const requestedIds = query.user_id ? [query.user_id] : undefined
      const userIds = await resolveUserIds(req, reply, requestedIds)
      if (userIds === null) return

      const userIdFilter =
        userIds.length > 0 ? Prisma.sql`AND al.user_id IN (${Prisma.join(userIds)})` : Prisma.empty

      const results = await db.$queryRaw<
        Array<{
          dow: number
          hour: number
          avg_score: number
          total_seconds: bigint
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(DOW FROM al.window_start)::int AS dow,
          EXTRACT(HOUR FROM al.window_start)::int AS hour,
          AVG(al.activity_score) AS avg_score,
          COALESCE(SUM(EXTRACT(EPOCH FROM (al.window_end - al.window_start)))::bigint, 0) AS total_seconds
        FROM "ActivityLog" al
        WHERE al.org_id = ${orgId}
          AND al.window_start >= ${from}
          AND al.window_start <= ${to}
          ${userIdFilter}
        GROUP BY dow, hour
        ORDER BY dow, hour
      `)

      const data = results.map((r) => ({
        dow: r.dow,
        hour: r.hour,
        avg_score: Math.round(r.avg_score * 100) / 100,
        total_seconds: Number(r.total_seconds),
      }))

      return { data, meta: reportMeta(from, to) }
    },
  })
}
