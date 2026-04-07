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

const querySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  project_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  user_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
})

export async function projectAllocationRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/projects/allocation', {
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
      const projectIds = parseIds(parsed.data.project_ids)
      const requestedUserIds = parseIds(parsed.data.user_ids)

      const userIds = await resolveUserIds(req, reply, requestedUserIds)
      if (!userIds) return

      const fromDate = new Date(from)
      const toDate = new Date(to)

      // Build where clause for sessions
      const whereClause: Prisma.TimeSessionWhereInput = {
        org_id: user.org_id,
        user_id: { in: userIds },
        started_at: { gte: fromDate },
        ended_at: { lte: toDate },
        ...(projectIds ? { project_id: { in: projectIds } } : { project_id: { not: null } }),
      }

      const sessions = await db.timeSession.findMany({
        where: whereClause,
        select: {
          project_id: true,
          user_id: true,
          duration_sec: true,
        },
      })

      // Aggregate by project_id, user_id
      const projectMap = new Map<string, { userHours: Map<string, number>; totalSec: number }>()
      for (const s of sessions) {
        if (!s.project_id) continue
        let entry = projectMap.get(s.project_id)
        if (!entry) {
          entry = { userHours: new Map(), totalSec: 0 }
          projectMap.set(s.project_id, entry)
        }
        entry.totalSec += s.duration_sec ?? 0
        const prev = entry.userHours.get(s.user_id) ?? 0
        entry.userHours.set(s.user_id, prev + (s.duration_sec ?? 0))
      }

      // Fetch project details
      const projectIdsToFetch = [...projectMap.keys()]
      const projects = await db.project.findMany({
        where: { id: { in: projectIdsToFetch }, org_id: user.org_id },
        select: { id: true, name: true, budget_hours: true, is_billable: true },
      })
      const projectLookup = new Map(projects.map((p) => [p.id, p]))

      // Fetch user names
      const allUserIds = new Set<string>()
      for (const entry of projectMap.values()) {
        for (const uid of entry.userHours.keys()) allUserIds.add(uid)
      }
      const users = await db.user.findMany({
        where: { id: { in: [...allUserIds] }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userLookup = new Map(users.map((u) => [u.id, u.name]))

      const data = projectIdsToFetch.map((pid) => {
        const entry = projectMap.get(pid)!
        const project = projectLookup.get(pid)
        const totalHours = entry.totalSec / 3600
        const budgetHours = project?.budget_hours ?? null
        const percentConsumed = budgetHours ? (totalHours / budgetHours) * 100 : null

        const contributingUsers = [...entry.userHours.entries()].map(([uid, sec]) => ({
          user_id: uid,
          user_name: userLookup.get(uid) ?? 'Unknown',
          hours: Math.round((sec / 3600) * 100) / 100,
        }))

        return {
          project: { id: pid, name: project?.name ?? 'Unknown' },
          total_hours: Math.round(totalHours * 100) / 100,
          budget_hours: budgetHours,
          percent_consumed: percentConsumed ? Math.round(percentConsumed * 100) / 100 : null,
          contributing_users: contributingUsers,
        }
      })

      return reply.send({ data, meta: reportMeta(from, to) })
    },
  })
}
