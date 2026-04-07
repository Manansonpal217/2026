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
import { parseIds } from '../../../lib/report-helpers.js'

const querySchema = z.object({
  project_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
})

export async function projectBudgetRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/projects/budget-vs-actuals', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const projectIds = parseIds(parsed.data.project_ids)

      const projects = await db.project.findMany({
        where: {
          org_id: user.org_id,
          ...(projectIds ? { id: { in: projectIds } } : {}),
          budget_hours: { not: null },
        },
        select: { id: true, name: true, budget_hours: true, created_at: true },
      })

      const data = await Promise.all(
        projects.map(async (project) => {
          const agg = await db.timeSession.aggregate({
            where: {
              org_id: user.org_id,
              project_id: project.id,
              approval_status: 'APPROVED',
            },
            _sum: { duration_sec: true },
          })

          const hoursUsed = (agg._sum.duration_sec ?? 0) / 3600
          const budgetHours = project.budget_hours ?? 0
          const hoursRemaining = Math.max(0, budgetHours - hoursUsed)
          const percentConsumed = budgetHours > 0 ? (hoursUsed / budgetHours) * 100 : 0

          const daysSinceCreated = Math.max(
            1,
            Math.ceil((Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24))
          )
          const burnRate = Math.round((hoursUsed / daysSinceCreated) * 100) / 100

          let status: 'on_track' | 'at_risk' | 'overrun' = 'on_track'
          if (percentConsumed > 100) status = 'overrun'
          else if (percentConsumed > 80) status = 'at_risk'

          return {
            project_id: project.id,
            project_name: project.name,
            budget_hours: budgetHours,
            hours_used: Math.round(hoursUsed * 100) / 100,
            hours_remaining: Math.round(hoursRemaining * 100) / 100,
            percent_consumed: Math.round(percentConsumed * 100) / 100,
            burn_rate: burnRate,
            status,
          }
        })
      )

      return reply.send({ data })
    },
  })
}
