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
  user_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function productivityAppBreakdownRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/productivity/app-breakdown', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const query = querySchema.parse(req.query)
      const { from, to, limit } = query
      const orgId = user.org_id

      const userIds = await resolveUserIds(req, reply, [query.user_id])
      if (userIds === null) return

      const userId = userIds[0]

      const apps = await db.$queryRaw<
        Array<{
          active_app: string
          total_seconds: bigint
          avg_score: number
          event_count: bigint
        }>
      >(Prisma.sql`
        SELECT
          al.active_app,
          COALESCE(SUM(EXTRACT(EPOCH FROM (al.window_end - al.window_start)))::bigint, 0) AS total_seconds,
          AVG(al.activity_score) AS avg_score,
          COUNT(*) AS event_count
        FROM "ActivityLog" al
        WHERE al.org_id = ${orgId}
          AND al.user_id = ${userId}
          AND al.window_start >= ${from}
          AND al.window_start <= ${to}
          AND al.active_app IS NOT NULL
        GROUP BY al.active_app
        ORDER BY total_seconds DESC
        LIMIT ${limit}
      `)

      // Fetch productivity rules for the org
      const rules = await db.$queryRaw<
        Array<{
          pattern: string
          type: string
        }>
      >(Prisma.sql`
        SELECT pattern, type FROM "ProductivityRule"
        WHERE org_id = ${orgId}
      `)

      const classifyApp = (appName: string): string | null => {
        for (const rule of rules) {
          if (appName.toLowerCase().includes(rule.pattern.toLowerCase())) {
            return rule.type
          }
        }
        return null
      }

      const appData = apps.map((a) => ({
        active_app: a.active_app,
        total_seconds: Number(a.total_seconds),
        avg_score: Math.round(a.avg_score * 100) / 100,
        event_count: Number(a.event_count),
        productivity_type: classifyApp(a.active_app),
      }))

      const urls = await db.$queryRaw<
        Array<{
          domain: string
          total_seconds: bigint
          avg_score: number
          event_count: bigint
        }>
      >(Prisma.sql`
        SELECT
          substring(al.active_url from '://([^/]+)') AS domain,
          COALESCE(SUM(EXTRACT(EPOCH FROM (al.window_end - al.window_start)))::bigint, 0) AS total_seconds,
          AVG(al.activity_score) AS avg_score,
          COUNT(*) AS event_count
        FROM "ActivityLog" al
        WHERE al.org_id = ${orgId}
          AND al.user_id = ${userId}
          AND al.window_start >= ${from}
          AND al.window_start <= ${to}
          AND al.active_url IS NOT NULL
          AND substring(al.active_url from '://([^/]+)') IS NOT NULL
        GROUP BY domain
        ORDER BY total_seconds DESC
        LIMIT ${limit}
      `)

      const urlData = urls.map((u) => ({
        domain: u.domain,
        total_seconds: Number(u.total_seconds),
        avg_score: Math.round(u.avg_score * 100) / 100,
        event_count: Number(u.event_count),
        productivity_type: classifyApp(u.domain),
      }))

      return {
        data: { apps: appData, urls: urlData },
        meta: reportMeta(from, to),
      }
    },
  })
}
