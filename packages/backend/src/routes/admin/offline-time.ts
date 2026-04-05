import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const PAGE_SIZE = 20

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
  user_id: z.string().uuid().optional(),
})

export async function adminOfflineTimeRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/offline-time', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      const parsed = querySchema.safeParse(request.query)
      const q = parsed.success ? parsed.data : { page: 1, status: undefined, user_id: undefined }

      const where = {
        org_id: caller.org_id,
        ...(q.status ? { status: q.status } : {}),
        ...(q.user_id ? { user_id: q.user_id } : {}),
      }

      const [entries, total] = await Promise.all([
        prisma.offlineTime.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (q.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            org_id: true,
            user_id: true,
            requested_by_id: true,
            approver_id: true,
            source: true,
            status: true,
            start_time: true,
            end_time: true,
            description: true,
            approver_note: true,
            expires_at: true,
            created_at: true,
            user: { select: { id: true, name: true, email: true } },
            requested_by: { select: { id: true, name: true } },
            approver: { select: { id: true, name: true } },
          },
        }),
        prisma.offlineTime.count({ where }),
      ])

      return {
        offline_time: entries,
        total,
        page: q.page,
        page_size: PAGE_SIZE,
      }
    },
  })
}
