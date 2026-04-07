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
})

export async function projectUserContributionRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/projects/user-contribution', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { from, to } = parsed.data
      const requestedUserIds = parseIds(parsed.data.user_ids)

      const userIds = await resolveUserIds(req, reply, requestedUserIds)
      if (!userIds) return

      const fromDate = new Date(from)
      const toDate = new Date(to)

      const sessions = await db.timeSession.findMany({
        where: {
          org_id: user.org_id,
          user_id: { in: userIds },
          started_at: { gte: fromDate },
          ended_at: { lte: toDate },
          project_id: { not: null },
        },
        select: { user_id: true, project_id: true, task_id: true, duration_sec: true },
      })

      // Aggregate per user per project
      const userProjectMap = new Map<string, Map<string, { sec: number; tasks: Set<string> }>>()
      const userTotalSec = new Map<string, number>()

      for (const s of sessions) {
        if (!s.project_id) continue
        let projectMap = userProjectMap.get(s.user_id)
        if (!projectMap) {
          projectMap = new Map()
          userProjectMap.set(s.user_id, projectMap)
        }
        let entry = projectMap.get(s.project_id)
        if (!entry) {
          entry = { sec: 0, tasks: new Set() }
          projectMap.set(s.project_id, entry)
        }
        entry.sec += s.duration_sec ?? 0
        if (s.task_id) entry.tasks.add(s.task_id)
        userTotalSec.set(s.user_id, (userTotalSec.get(s.user_id) ?? 0) + (s.duration_sec ?? 0))
      }

      // Fetch project names
      const allProjectIds = new Set<string>()
      for (const pm of userProjectMap.values()) {
        for (const pid of pm.keys()) allProjectIds.add(pid)
      }
      const projects = await db.project.findMany({
        where: { id: { in: [...allProjectIds] }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const projectLookup = new Map(projects.map((p) => [p.id, p.name]))

      // Fetch user names
      const users = await db.user.findMany({
        where: { id: { in: userIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userLookup = new Map(users.map((u) => [u.id, u.name]))

      const data = userIds.map((uid) => {
        const projectMap = userProjectMap.get(uid)
        const totalSec = userTotalSec.get(uid) ?? 0
        const projectBreakdown = projectMap
          ? [...projectMap.entries()].map(([pid, entry]) => ({
              project_id: pid,
              project_name: projectLookup.get(pid) ?? 'Unknown',
              hours: Math.round((entry.sec / 3600) * 100) / 100,
              percent_of_user_total:
                totalSec > 0 ? Math.round((entry.sec / totalSec) * 10000) / 100 : 0,
              task_count: entry.tasks.size,
            }))
          : []

        return {
          user_id: uid,
          user_name: userLookup.get(uid) ?? 'Unknown',
          projects: projectBreakdown,
        }
      })

      return reply.send({ data, meta: reportMeta(from, to) })
    },
  })
}
