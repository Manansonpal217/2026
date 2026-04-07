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
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  actor_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  action: z.string().optional(),
  target_type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function complianceAuditLogRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/compliance/audit-log', {
    preHandler: [authenticate, requirePermission(Permission.REPORTS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const db = getDbRead()

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { from, to, action, target_type, page, limit } = parsed.data
      const actorIds = parseIds(parsed.data.actor_ids)

      const fromDate = new Date(from)
      const toDate = new Date(to)

      const where = {
        org_id: user.org_id,
        created_at: { gte: fromDate, lte: toDate },
        ...(actorIds ? { actor_id: { in: actorIds } } : {}),
        ...(action ? { action: { contains: action } } : {}),
        ...(target_type ? { target_type } : {}),
      }

      const [total, logs] = await Promise.all([
        db.auditLog.count({ where }),
        db.auditLog.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            actor_id: true,
            action: true,
            target_type: true,
            target_id: true,
            old_value: true,
            new_value: true,
            ip_address: true,
            created_at: true,
          },
        }),
      ])

      // Fetch actor names
      const actorIdSet = [...new Set(logs.map((l) => l.actor_id))]
      const actors = await db.user.findMany({
        where: { id: { in: actorIdSet }, org_id: user.org_id },
        select: { id: true, name: true },
      })
      const actorLookup = new Map(actors.map((a) => [a.id, a.name]))

      const data = logs.map((log) => ({
        id: log.id,
        actor_name: actorLookup.get(log.actor_id) ?? 'Unknown',
        action: log.action,
        target_type: log.target_type,
        target_id: log.target_id,
        old_value: log.old_value,
        new_value: log.new_value,
        ip_address: log.ip_address,
        created_at: log.created_at,
      }))

      return reply.send({
        data,
        meta: { from, to, total, page, limit },
      })
    },
  })
}
