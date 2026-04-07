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
import { parseIds, reportMeta } from '../../../lib/report-helpers.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  project_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  assignee_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
})

export async function projectTaskAccuracyRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/projects/task-accuracy', {
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
      const assigneeIds = parseIds(parsed.data.assignee_ids)

      const fromDate = new Date(from)
      const toDate = new Date(to)

      // Find tasks with Jira issues that have estimates
      const taskWhere: Prisma.TaskWhereInput = {
        org_id: user.org_id,
        ...(projectIds ? { project_id: { in: projectIds } } : {}),
        ...(assigneeIds ? { assignee_user_id: { in: assigneeIds } } : {}),
        external_id: { not: null },
      }

      const tasks = await db.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          project_id: true,
          external_id: true,
          assignee_user_id: true,
        },
      })

      // Get matching Jira issues with estimates
      const externalIds = tasks.map((t) => t.external_id).filter(Boolean) as string[]
      if (externalIds.length === 0) {
        return reply.send({ data: [], meta: reportMeta(from, to, 0) })
      }

      const jiraIssues = await db.jiraIssue.findMany({
        where: {
          org_id: user.org_id,
          key: { in: externalIds },
          original_estimate_sec: { not: null },
        },
        select: {
          key: true,
          summary: true,
          assignee_email: true,
          priority: true,
          due_date: true,
          original_estimate_sec: true,
          status: true,
        },
      })
      const jiraLookup = new Map(jiraIssues.map((j) => [j.key, j]))

      // Get tracked time per task
      const taskIds = tasks
        .filter((t) => t.external_id && jiraLookup.has(t.external_id))
        .map((t) => t.id)
      const sessions = await db.timeSession.findMany({
        where: {
          org_id: user.org_id,
          task_id: { in: taskIds },
          started_at: { gte: fromDate },
          ended_at: { lte: toDate },
        },
        select: { task_id: true, duration_sec: true },
      })

      const taskHours = new Map<string, number>()
      for (const s of sessions) {
        if (!s.task_id) continue
        taskHours.set(s.task_id, (taskHours.get(s.task_id) ?? 0) + (s.duration_sec ?? 0))
      }

      const data = tasks
        .filter((t) => t.external_id && jiraLookup.has(t.external_id))
        .map((t) => {
          const jira = jiraLookup.get(t.external_id!)!
          const trackedHours = (taskHours.get(t.id) ?? 0) / 3600
          const estimateHours = (jira.original_estimate_sec ?? 0) / 3600
          return {
            issue_key: jira.key,
            summary: jira.summary,
            assignee_email: jira.assignee_email,
            priority: jira.priority,
            due_date: jira.due_date,
            tracked_hours: Math.round(trackedHours * 100) / 100,
            estimate_hours: Math.round(estimateHours * 100) / 100,
            delta: Math.round((trackedHours - estimateHours) * 100) / 100,
            status: jira.status,
          }
        })

      return reply.send({ data, meta: reportMeta(from, to, data.length) })
    },
  })
}
