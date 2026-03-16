import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { generateSignedUrl, deleteFromS3 } from '../../lib/s3.js'

const querySchema = z.object({
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function screenshotListRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const canViewOthers = ['admin', 'super_admin', 'manager'].includes(user.role)
      const targetUserId = canViewOthers && query.user_id ? query.user_id : user.id

      const where = {
        org_id: user.org_id,
        user_id: targetUserId,
        deleted_at: null,
        ...(query.session_id && { session_id: query.session_id }),
        ...(query.from || query.to
          ? {
              taken_at: {
                ...(query.from && { gte: new Date(query.from) }),
                ...(query.to && { lte: new Date(query.to) }),
              },
            }
          : {}),
      }

      const [screenshots, total] = await Promise.all([
        prisma.screenshot.findMany({
          where,
          orderBy: { taken_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.screenshot.count({ where }),
      ])

      // Generate signed URLs (15-min expiry) — never expose raw S3 keys
      const results = await Promise.all(
        screenshots.map(async (s) => ({
          id: s.id,
          session_id: s.session_id,
          taken_at: s.taken_at,
          activity_score: s.activity_score,
          is_blurred: s.is_blurred,
          file_size_bytes: s.file_size_bytes,
          signed_url: await generateSignedUrl(opts.config, s.s3_key, 900),
        })),
      )

      return { screenshots: results, total, page: query.page, limit: query.limit }
    },
  })

  fastify.delete('/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const screenshot = await prisma.screenshot.findFirst({
        where: { id, org_id: user.org_id, deleted_at: null },
      })
      if (!screenshot) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Screenshot not found' })
      }

      // Soft delete — physical S3 deletion handled by retention job
      await prisma.screenshot.update({
        where: { id },
        data: { deleted_at: new Date() },
      })

      return reply.status(204).send()
    },
  })
}
