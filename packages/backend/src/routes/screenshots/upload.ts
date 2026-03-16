import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { generatePresignedPutUrl } from '../../lib/s3.js'

const uploadUrlSchema = z.object({
  session_id: z.string().uuid(),
  taken_at: z.string().datetime(),
  file_size_bytes: z.number().int().min(1).max(50 * 1024 * 1024), // 50 MB max
  activity_score: z.number().min(0).max(100).default(0),
})

export async function screenshotUploadRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.post('/upload-url', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = uploadUrlSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      // Verify session belongs to this user
      const session = await prisma.timeSession.findFirst({
        where: { id: body.data.session_id, user_id: user.id, org_id: user.org_id },
      })
      if (!session) {
        return reply
          .status(404)
          .send({ code: 'NOT_FOUND', message: 'Session not found or does not belong to you' })
      }

      const screenshotId = uuidv4()
      const takenAt = new Date(body.data.taken_at)
      const year = takenAt.getUTCFullYear()
      const month = String(takenAt.getUTCMonth() + 1).padStart(2, '0')
      const s3Key = `${user.org_id}/${user.id}/${year}/${month}/${screenshotId}.enc`

      // Generate presigned PUT URL (10 min expiry)
      const presignedUrl = await generatePresignedPutUrl(opts.config, s3Key, 600)

      // Create Screenshot record (unconfirmed)
      await prisma.screenshot.create({
        data: {
          id: screenshotId,
          session_id: body.data.session_id,
          user_id: user.id,
          org_id: user.org_id,
          s3_key: s3Key,
          taken_at: takenAt,
          activity_score: body.data.activity_score,
          file_size_bytes: body.data.file_size_bytes,
        },
      })

      return {
        upload_id: screenshotId,
        presigned_url: presignedUrl,
        s3_key: s3Key,
      }
    },
  })
}
