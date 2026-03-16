import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDbRead } from '../../lib/db-read.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

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
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(',')
}

export async function exportReportRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/export', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const canViewOthers = ['admin', 'super_admin', 'manager'].includes(user.role)
      const userIds = canViewOthers && query.user_id
        ? Array.isArray(query.user_id) ? query.user_id : [query.user_id]
        : [user.id]

      const projectIds = query.project_id
        ? Array.isArray(query.project_id) ? query.project_id : [query.project_id]
        : undefined

      const where = {
        org_id: user.org_id,
        user_id: { in: userIds },
        ended_at: { not: null },
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
        ]),
      )

      const csv = [formatCsvRow(headers), ...rows].join('\n')

      reply.header('Content-Type', 'text/csv')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(csv)
    },
  })
}
