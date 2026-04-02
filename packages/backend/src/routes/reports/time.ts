import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getISOWeek, getISOWeekYear } from 'date-fns'
import { prisma } from '../../db/prisma.js'
import { getDbRead } from '../../lib/db-read.js'
import { createAuthenticateMiddleware, requirePermission } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import {
  filterAccessibleUserIds,
  mayActAsPeopleManager,
  Permission,
} from '../../lib/permissions.js'
import { timeApprovalTotalsFilter } from '../../lib/time-approval-scope.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  user_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  project_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  group_by: z.enum(['day', 'week', 'project', 'user']).default('day'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function timeReportRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/time', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const requestedRaw =
        mayActAsPeopleManager(user.role) && query.user_id
          ? Array.isArray(query.user_id)
            ? query.user_id
            : [query.user_id]
          : [user.id]

      const userIds = await filterAccessibleUserIds(user, requestedRaw)
      if (userIds.length !== requestedRaw.length) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Access denied for one or more selected users',
        })
      }

      const projectIds = query.project_id
        ? Array.isArray(query.project_id)
          ? query.project_id
          : [query.project_id]
        : undefined

      // Explicitly validate user_id and project_id belong to org
      if (userIds.length > 0) {
        const validUsers = await prisma.user.findMany({
          where: { id: { in: userIds }, org_id: user.org_id },
          select: { id: true },
        })
        const validUserSet = new Set(validUsers.map((u) => u.id))
        const invalid = userIds.find((id) => !validUserSet.has(id))
        if (invalid) {
          return reply.status(400).send({
            code: 'INVALID_USER',
            message: `User ${invalid} not found in your organization`,
          })
        }
      }
      if (projectIds && projectIds.length > 0) {
        const validProjects = await prisma.project.findMany({
          where: { id: { in: projectIds }, org_id: user.org_id },
          select: { id: true },
        })
        const validProjectSet = new Set(validProjects.map((p) => p.id))
        const invalid = projectIds.find((id) => !validProjectSet.has(id))
        if (invalid) {
          return reply.status(400).send({
            code: 'INVALID_PROJECT',
            message: `Project ${invalid} not found in your organization`,
          })
        }
      }

      const approvalTotals = await timeApprovalTotalsFilter(user.org_id)
      const where = {
        org_id: user.org_id,
        user_id: { in: userIds },
        ended_at: { not: null },
        ...approvalTotals,
        ...(projectIds && { project_id: { in: projectIds } }),
        ...(query.from || query.to
          ? {
              started_at: {
                ...(query.from && { gte: new Date(query.from) }),
                ...(query.to && { lte: new Date(query.to) }),
              },
            }
          : {}),
      }

      const [sessions, aggregate] = await Promise.all([
        db.timeSession.findMany({
          where,
          orderBy: { started_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            user: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true, color: true } },
            task: { select: { id: true, name: true } },
          },
        }),
        db.timeSession.aggregate({ where, _sum: { duration_sec: true } }),
      ])

      const total_seconds = aggregate._sum.duration_sec ?? 0

      // Build breakdown based on group_by
      let breakdown: Array<{ label: string; seconds: number; sessions: number }> = []

      if (query.group_by === 'day') {
        const dayMap = new Map<string, { seconds: number; sessions: number }>()
        for (const s of sessions) {
          const day = s.started_at.toISOString().split('T')[0]
          const existing = dayMap.get(day) ?? { seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          dayMap.set(day, existing)
        }
        breakdown = [...dayMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, v]) => ({ label, ...v }))
      } else if (query.group_by === 'project') {
        const projMap = new Map<string, { name: string; seconds: number; sessions: number }>()
        for (const s of sessions) {
          const key = s.project_id ?? 'no-project'
          const name = s.project?.name ?? 'No project'
          const existing = projMap.get(key) ?? { name, seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          projMap.set(key, existing)
        }
        breakdown = [...projMap.values()]
          .sort((a, b) => b.seconds - a.seconds)
          .map(({ name, seconds, sessions: sc }) => ({ label: name, seconds, sessions: sc }))
      } else if (query.group_by === 'user') {
        const userMap = new Map<string, { name: string; seconds: number; sessions: number }>()
        for (const s of sessions) {
          const key = s.user_id
          const name = s.user?.name ?? 'Unknown'
          const existing = userMap.get(key) ?? { name, seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          userMap.set(key, existing)
        }
        breakdown = [...userMap.values()]
          .sort((a, b) => b.seconds - a.seconds)
          .map(({ name, seconds, sessions: sc }) => ({ label: name, seconds, sessions: sc }))
      } else if (query.group_by === 'week') {
        const weekMap = new Map<string, { seconds: number; sessions: number }>()
        for (const s of sessions) {
          const y = getISOWeekYear(s.started_at)
          const w = getISOWeek(s.started_at)
          const label = `${y}-W${String(w).padStart(2, '0')}`
          const existing = weekMap.get(label) ?? { seconds: 0, sessions: 0 }
          existing.seconds += s.duration_sec
          existing.sessions += 1
          weekMap.set(label, existing)
        }
        breakdown = [...weekMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, v]) => ({ label, ...v }))
      }

      return {
        total_seconds,
        breakdown,
        sessions: query.group_by === 'day' ? sessions : [],
        page: query.page,
        limit: query.limit,
      }
    },
  })
}
