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
  project_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  user_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
})

export async function billingCostEstimateRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/billing/cost-estimate', {
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

      // Get sessions grouped by user
      const sessions = await db.timeSession.findMany({
        where: {
          org_id: user.org_id,
          user_id: { in: userIds },
          started_at: { gte: fromDate },
          ended_at: { lte: toDate },
          ...(projectIds ? { project_id: { in: projectIds } } : {}),
        },
        select: { user_id: true, duration_sec: true, started_at: true },
      })

      // Aggregate hours per user
      const userHoursMap = new Map<string, number>()
      for (const s of sessions) {
        userHoursMap.set(s.user_id, (userHoursMap.get(s.user_id) ?? 0) + (s.duration_sec ?? 0))
      }

      // Fetch user rates
      const rates = await db.userRate.findMany({
        where: {
          org_id: user.org_id,
          user_id: { in: userIds },
          effective_from: { lte: toDate },
          OR: [{ effective_to: null }, { effective_to: { gte: fromDate } }],
        },
        select: {
          user_id: true,
          rate_per_hour: true,
          currency: true,
          effective_from: true,
          effective_to: true,
        },
        orderBy: { effective_from: 'desc' },
      })

      // Use the most recent rate per user
      const rateLookup = new Map<string, { rate_per_hour: number; currency: string }>()
      for (const r of rates) {
        if (!rateLookup.has(r.user_id)) {
          rateLookup.set(r.user_id, {
            rate_per_hour: Number(r.rate_per_hour),
            currency: r.currency,
          })
        }
      }

      // Fetch user names
      const users = await db.user.findMany({
        where: { id: { in: userIds }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const userLookup = new Map(users.map((u) => [u.id, u.name]))

      const data = [...userHoursMap.entries()].map(([uid, totalSec]) => {
        const hours = Math.round((totalSec / 3600) * 100) / 100
        const rate = rateLookup.get(uid)
        const missingRate = !rate
        const ratePerHour = rate?.rate_per_hour ?? 0
        const cost = Math.round(ratePerHour * hours * 100) / 100

        return {
          user_name: userLookup.get(uid) ?? 'Unknown',
          rate_per_hour: ratePerHour,
          currency: rate?.currency ?? 'USD',
          hours,
          cost,
          missing_rate: missingRate,
        }
      })

      return reply.send({ data, meta: reportMeta(from, to, data.length) })
    },
  })
}
