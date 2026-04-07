import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
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
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  user_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  action: z.enum(['deleted', 'blurred', 'unblurred']).optional(),
})

const ACTION_MAP: Record<string, string[]> = {
  deleted: ['screenshot.delete'],
  blurred: ['screenshot.blur'],
  unblurred: ['screenshot.unblur'],
}

export async function complianceScreenshotAuditRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/compliance/screenshot-audit', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { from, to, action } = parsed.data
      const requestedUserIds = parseIds(parsed.data.user_ids)

      const userIds = await resolveUserIds(req, reply, requestedUserIds)
      if (!userIds) return

      const fromDate = new Date(from)
      const toDate = new Date(to)

      const actions = action
        ? ACTION_MAP[action]
        : ['screenshot.delete', 'screenshot.blur', 'screenshot.unblur']

      const auditLogs = await db.auditLog.findMany({
        where: {
          org_id: user.org_id,
          action: { in: actions },
          target_type: 'Screenshot',
          created_at: { gte: fromDate, lte: toDate },
          ...(requestedUserIds ? { actor_id: { in: userIds } } : {}),
        },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          actor_id: true,
          action: true,
          target_id: true,
          ip_address: true,
          created_at: true,
        },
      })

      // Fetch actor names
      const actorIds = [...new Set(auditLogs.map((l) => l.actor_id))]
      const actors = await db.user.findMany({
        where: { id: { in: actorIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const actorLookup = new Map(actors.map((a) => [a.id, a.name]))

      // Fetch screenshots to get user_id (target user)
      const screenshotIds = auditLogs.map((l) => l.target_id).filter(Boolean) as string[]
      const screenshots = await db.screenshot.findMany({
        where: { id: { in: screenshotIds }, org_id: user.org_id },
        select: { id: true, user_id: true, session_id: true },
      })
      const ssLookup = new Map(screenshots.map((s) => [s.id, s]))

      // Fetch target user names
      const targetUserIds = [...new Set(screenshots.map((s) => s.user_id))]
      const targetUsers = await db.user.findMany({
        where: { id: { in: targetUserIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const targetUserLookup = new Map(targetUsers.map((u) => [u.id, u.name]))

      // Fetch deductions linked to sessions
      const sessionIds = [...new Set(screenshots.map((s) => s.session_id))]
      const deductions = await db.sessionTimeDeduction.findMany({
        where: { org_id: user.org_id, session_id: { in: sessionIds } },
        select: { session_id: true, range_start: true, range_end: true },
      })
      const deductionBySession = new Map<string, number>()
      for (const d of deductions) {
        const sec = (new Date(d.range_end).getTime() - new Date(d.range_start).getTime()) / 1000
        deductionBySession.set(d.session_id, (deductionBySession.get(d.session_id) ?? 0) + sec)
      }

      const data = auditLogs.map((log) => {
        const ss = log.target_id ? ssLookup.get(log.target_id) : undefined
        return {
          actor_name: actorLookup.get(log.actor_id) ?? 'Unknown',
          target_user_name: ss ? (targetUserLookup.get(ss.user_id) ?? 'Unknown') : 'Unknown',
          timestamp: log.created_at,
          action: log.action,
          deducted_seconds: ss ? (deductionBySession.get(ss.session_id) ?? 0) : 0,
          ip_address: log.ip_address,
        }
      })

      return reply.send({ data, meta: reportMeta(from, to, data.length) })
    },
  })
}
