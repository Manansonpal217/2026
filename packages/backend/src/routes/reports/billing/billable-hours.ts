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
import { timeApprovalTotalsFilter } from '../../../lib/time-approval-scope.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  project_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  user_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  approval_status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
})

export async function billingBillableHoursRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/billing/billable-hours', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { from, to, approval_status } = parsed.data
      const projectIds = parseIds(parsed.data.project_ids)
      const requestedUserIds = parseIds(parsed.data.user_ids)

      const userIds = await resolveUserIds(req, reply, requestedUserIds)
      if (!userIds) return

      const fromDate = new Date(from)
      const toDate = new Date(to)

      // Get billable project IDs
      const billableProjects = await db.project.findMany({
        where: {
          org_id: user.org_id,
          is_billable: true,
          ...(projectIds ? { id: { in: projectIds } } : {}),
        },
        select: { id: true, name: true },
      })
      const billableProjectIds = billableProjects.map((p) => p.id)
      const projectLookup = new Map(billableProjects.map((p) => [p.id, p.name]))

      if (billableProjectIds.length === 0) {
        return reply.send({ data: [], meta: reportMeta(from, to, 0) })
      }

      const approvalFilter = approval_status
        ? { approval_status }
        : await timeApprovalTotalsFilter(user.org_id)

      const sessions = await db.timeSession.findMany({
        where: {
          org_id: user.org_id,
          user_id: { in: userIds },
          project_id: { in: billableProjectIds },
          ended_at: { not: null },
          started_at: { gte: fromDate, lte: toDate },
          ...approvalFilter,
        },
        select: {
          id: true,
          user_id: true,
          project_id: true,
          started_at: true,
          duration_sec: true,
          is_manual: true,
          approval_status: true,
        },
        orderBy: { started_at: 'desc' },
      })

      // Fetch user names
      const sessionUserIds = [...new Set(sessions.map((s) => s.user_id))]
      const users = await db.user.findMany({
        where: { id: { in: sessionUserIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userLookup = new Map(users.map((u) => [u.id, u.name]))

      const data = sessions.map((s) => ({
        project_name: s.project_id ? (projectLookup.get(s.project_id) ?? 'Unknown') : null,
        user_name: userLookup.get(s.user_id) ?? 'Unknown',
        date: s.started_at,
        hours: Math.round(((s.duration_sec ?? 0) / 3600) * 100) / 100,
        is_manual: s.is_manual,
        approval_status: s.approval_status,
      }))

      return reply.send({ data, meta: reportMeta(from, to, data.length) })
    },
  })
}
