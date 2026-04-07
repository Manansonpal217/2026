import type { FastifyInstance } from 'fastify'
import { getDbRead } from '../../../lib/db-read.js'
import {
  createAuthenticateMiddleware,
  requirePermission,
} from '../../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../../middleware/authenticate.js'
import type { Config } from '../../../config.js'
import { Permission } from '../../../lib/permissions.js'

export async function complianceDataRetentionRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/compliance/data-retention', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const now = new Date()
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
      const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

      const orgId = user.org_id

      const [lt30, b30_60, b60_90, gt90, total, deleted] = await Promise.all([
        db.screenshot.count({
          where: { org_id: orgId, deleted_at: null, taken_at: { gte: d30 } },
        }),
        db.screenshot.count({
          where: { org_id: orgId, deleted_at: null, taken_at: { gte: d60, lt: d30 } },
        }),
        db.screenshot.count({
          where: { org_id: orgId, deleted_at: null, taken_at: { gte: d90, lt: d60 } },
        }),
        db.screenshot.count({
          where: { org_id: orgId, deleted_at: null, taken_at: { lt: d90 } },
        }),
        db.screenshot.count({
          where: { org_id: orgId },
        }),
        db.screenshot.count({
          where: { org_id: orgId, deleted_at: { not: null } },
        }),
      ])

      // Get retention setting
      const settings = await db.orgSettings.findFirst({
        where: { org_id: orgId },
        select: { screenshot_retention_days: true },
      })
      const retentionDays = settings?.screenshot_retention_days ?? 90

      const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
      const projectedDeletion = await db.screenshot.count({
        where: {
          org_id: orgId,
          taken_at: { lt: retentionCutoff },
          deleted_at: null,
        },
      })

      return reply.send({
        data: {
          buckets: {
            lt_30d: lt30,
            '30_60d': b30_60,
            '60_90d': b60_90,
            gt_90d: gt90,
          },
          total,
          deleted,
          retention_days: retentionDays,
          projected_deletion: projectedDeletion,
        },
        meta: { generated_at: now.toISOString() },
      })
    },
  })
}
