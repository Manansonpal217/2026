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
  taken_at: z.string().datetime({ offset: true }),
  file_size_bytes: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024), // 50 MB max
  /** Encrypted thumb blob size on device; when set, client must upload second object to thumb_presigned_url */
  thumb_file_size_bytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024)
    .optional(),
  activity_score: z.number().min(0).max(100).default(0),
})

export async function screenshotUploadRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  /** Retry PUT for thumbnail only (e.g. after confirm returned S3_THUMB_NOT_FOUND). */
  fastify.post('/:id/thumb-presign', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const shot = await prisma.screenshot.findFirst({
        where: { id, user_id: user.id, org_id: user.org_id, deleted_at: null },
        select: { thumb_s3_key: true },
      })
      if (!shot?.thumb_s3_key) {
        return reply
          .status(404)
          .send({ code: 'NO_THUMB', message: 'Screenshot has no thumbnail key' })
      }

      try {
        const thumb_presigned_url = await generatePresignedPutUrl(
          opts.config,
          shot.thumb_s3_key,
          600
        )
        return { thumb_presigned_url }
      } catch (err) {
        request.log.error({ err, id }, 'thumb-presign failed')
        return reply.status(503).send({
          code: 'S3_PRESIGN_FAILED',
          message: err instanceof Error ? err.message : 'Could not generate thumb upload URL',
        })
      }
    },
  })

  fastify.post('/upload-url', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = uploadUrlSchema.safeParse(request.body)
      if (!body.success) {
        request.log.warn(
          { err: body.error.flatten() },
          'POST /screenshots/upload-url validation failed'
        )
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      // Verify session belongs to this user
      const session = await prisma.timeSession.findFirst({
        where: { id: body.data.session_id, user_id: user.id, org_id: user.org_id },
      })
      if (!session) {
        request.log.warn(
          { session_id: body.data.session_id, user_id: user.id },
          'POST /screenshots/upload-url session not found'
        )
        return reply
          .status(404)
          .send({ code: 'NOT_FOUND', message: 'Session not found or does not belong to you' })
      }

      const screenshotId = uuidv4()
      const takenAt = new Date(body.data.taken_at)
      const dateStr = takenAt.toISOString().slice(0, 10) // YYYY-MM-DD
      const org = await prisma.organization.findUnique({
        where: { id: user.org_id },
        select: { slug: true },
      })
      const slug = org?.slug ?? user.org_id
      const orgSegment = slug === opts.config.S3_SCREENSHOT_BUCKET ? user.org_id : slug
      const s3Key = `${orgSegment}/${user.id}/${dateStr}/${screenshotId}.enc`
      const thumbFileSize = body.data.thumb_file_size_bytes
      const hasThumb = thumbFileSize != null && thumbFileSize > 0
      const thumbS3Key = hasThumb
        ? `${orgSegment}/${user.id}/${dateStr}/${screenshotId}.thumb.webp`
        : null

      // Persist first so Postgres reflects upload attempts even if S3 presign fails (then we roll back).
      await prisma.screenshot.create({
        data: {
          id: screenshotId,
          session_id: body.data.session_id,
          user_id: user.id,
          org_id: user.org_id,
          s3_key: s3Key,
          thumb_s3_key: thumbS3Key,
          taken_at: takenAt,
          activity_score: body.data.activity_score,
          file_size_bytes: body.data.file_size_bytes,
          thumb_file_size_bytes: hasThumb ? thumbFileSize : 0,
        },
      })

      let presignedUrl: string
      let thumbPresignedUrl: string | null = null
      try {
        presignedUrl = await generatePresignedPutUrl(opts.config, s3Key, 600)
        if (thumbS3Key) {
          thumbPresignedUrl = await generatePresignedPutUrl(opts.config, thumbS3Key, 600)
        }
      } catch (err) {
        request.log.error(
          { err, screenshotId, s3Key, user_id: user.id },
          'POST /screenshots/upload-url S3 presign failed'
        )
        await prisma.screenshot.delete({ where: { id: screenshotId } }).catch(() => {})
        const message = err instanceof Error ? err.message : 'Could not generate upload URL'
        return reply.status(503).send({
          code: 'S3_PRESIGN_FAILED',
          message,
        })
      }

      return {
        upload_id: screenshotId,
        presigned_url: presignedUrl,
        thumb_presigned_url: thumbPresignedUrl,
        s3_key: s3Key,
        thumb_s3_key: thumbS3Key,
      }
    },
  })
}
