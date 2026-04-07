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
  approval_status: z.string().optional(),
})

export async function complianceManualTimeRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/compliance/manual-time', {
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
      const requestedUserIds = parseIds(parsed.data.user_ids)

      const userIds = await resolveUserIds(req, reply, requestedUserIds)
      if (!userIds) return

      const fromDate = new Date(from)
      const toDate = new Date(to)

      // Get manual sessions
      const manualSessions = await db.timeSession.findMany({
        where: {
          org_id: user.org_id,
          user_id: { in: userIds },
          is_manual: true,
          started_at: { gte: fromDate },
          ended_at: { lte: toDate },
          ...(approval_status ? { approval_status } : {}),
        },
        select: {
          id: true,
          user_id: true,
          project_id: true,
          started_at: true,
          ended_at: true,
          duration_sec: true,
          approval_status: true,
          notes: true,
        },
        orderBy: { started_at: 'desc' },
      })

      // Get total sessions per user for ratio calculation
      const totalAgg = await db.timeSession.groupBy({
        by: ['user_id'],
        where: {
          org_id: user.org_id,
          user_id: { in: userIds },
          started_at: { gte: fromDate },
          ended_at: { lte: toDate },
        },
        _sum: { duration_sec: true },
      })
      const totalSecByUser = new Map(totalAgg.map((a) => [a.user_id, a._sum.duration_sec ?? 0]))

      // Manual totals per user
      const manualSecByUser = new Map<string, number>()
      for (const s of manualSessions) {
        manualSecByUser.set(
          s.user_id,
          (manualSecByUser.get(s.user_id) ?? 0) + (s.duration_sec ?? 0)
        )
      }

      // Fetch user and project names
      const allUserIds = [...new Set(manualSessions.map((s) => s.user_id))]
      const users = await db.user.findMany({
        where: { id: { in: allUserIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userLookup = new Map(users.map((u) => [u.id, u.name]))

      const projectIds = [
        ...new Set(manualSessions.map((s) => s.project_id).filter(Boolean)),
      ] as string[]
      const projects = await db.project.findMany({
        where: { id: { in: projectIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const projectLookup = new Map(projects.map((p) => [p.id, p.name]))

      const entries = manualSessions.map((s) => ({
        id: s.id,
        user_name: userLookup.get(s.user_id) ?? 'Unknown',
        project_name: s.project_id ? (projectLookup.get(s.project_id) ?? 'Unknown') : null,
        started_at: s.started_at,
        ended_at: s.ended_at,
        hours: Math.round(((s.duration_sec ?? 0) / 3600) * 100) / 100,
        approval_status: s.approval_status,
        notes: s.notes,
      }))

      const userSummary = [...manualSecByUser.entries()].map(([uid, manualSec]) => {
        const totalSec = totalSecByUser.get(uid) ?? 0
        return {
          user_id: uid,
          user_name: userLookup.get(uid) ?? 'Unknown',
          manual_hours: Math.round((manualSec / 3600) * 100) / 100,
          total_hours: Math.round((totalSec / 3600) * 100) / 100,
          manual_ratio: totalSec > 0 ? Math.round((manualSec / totalSec) * 10000) / 100 : 0,
        }
      })

      return reply.send({
        data: { entries, user_summary: userSummary },
        meta: reportMeta(from, to, entries.length),
      })
    },
  })
}
