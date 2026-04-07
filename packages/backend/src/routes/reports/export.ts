import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
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
import { getPdfExportQueue } from '../../queues/index.js'
import type { PdfExportJobData, PdfExportJobResult } from '../../queues/workers/pdfExportWorker.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  user_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  project_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
})

function formatCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    })
    .join(',')
}

export async function exportReportRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/export', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_EXPORT)],
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

      const sessions = await db.timeSession.findMany({
        where,
        orderBy: { started_at: 'asc' },
        take: 10000,
        include: {
          user: { select: { name: true, email: true } },
          project: { select: { name: true } },
          task: { select: { name: true } },
        },
      })

      const dateStr = new Date().toISOString().split('T')[0]
      const filename = `report-${dateStr}.${query.format}`

      if (query.format === 'json') {
        reply.header('Content-Type', 'application/json')
        reply.header('Content-Disposition', `attachment; filename="${filename}"`)
        return reply.send({ sessions, exported_at: new Date().toISOString() })
      }

      // CSV
      const headers = [
        'Session ID',
        'User Name',
        'User Email',
        'Project',
        'Task',
        'Started At',
        'Ended At',
        'Duration (sec)',
        'Duration (hh:mm:ss)',
        'Notes',
        'Approval Status',
        'Is Manual',
      ]

      function secToHms(sec: number): string {
        const h = Math.floor(sec / 3600)
        const m = Math.floor((sec % 3600) / 60)
        const s = sec % 60
        return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
      }

      const rows = sessions.map((s) =>
        formatCsvRow([
          s.id,
          s.user?.name ?? '',
          s.user?.email ?? '',
          s.project?.name ?? '',
          s.task?.name ?? '',
          s.started_at.toISOString(),
          s.ended_at?.toISOString() ?? '',
          s.duration_sec,
          secToHms(s.duration_sec),
          s.notes ?? '',
          s.approval_status,
          s.is_manual ? '1' : '0',
        ])
      )

      const csv = [formatCsvRow(headers), ...rows].join('\n')

      reply.header('Content-Type', 'text/csv')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(csv)
    },
  })

  const pdfBodySchema = z.object({
    from: z.string(),
    to: z.string(),
    user_id: z.string().uuid().optional(),
  })

  fastify.post('/export/pdf', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_EXPORT)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const parsed = pdfBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const body = parsed.data

      const targetUserId = body.user_id && mayActAsPeopleManager(user.role) ? body.user_id : user.id

      if (body.user_id && body.user_id !== user.id) {
        const ids = await filterAccessibleUserIds(user, [body.user_id])
        if (ids.length === 0) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
      }

      const queue = getPdfExportQueue()
      const job = await queue.add('pdf-export', {
        userId: user.id,
        orgId: user.org_id,
        from: body.from,
        to: body.to,
        targetUserId,
      } satisfies PdfExportJobData)

      return { jobId: job.id }
    },
  })

  fastify.get('/export/pdf/:jobId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { jobId } = request.params as { jobId: string }
      const queue = getPdfExportQueue()
      const job = await queue.getJob(jobId)
      if (!job) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Job not found' })
      }

      const state = await job.getState()
      if (state === 'completed') {
        const result = job.returnvalue as PdfExportJobResult | undefined
        return { status: 'completed', url: result?.url ?? null }
      }
      if (state === 'failed') {
        const result = job.returnvalue as PdfExportJobResult | undefined
        const error = result?.error ?? job.failedReason ?? 'Export failed'
        return { status: 'failed', error }
      }
      return { status: 'processing' }
    },
  })
}
