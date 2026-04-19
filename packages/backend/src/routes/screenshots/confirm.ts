import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { objectExists } from '../../lib/s3.js'
import { resolveFeature } from '../../lib/settings.js'

const confirmSchema = z.object({
  upload_id: z.string().uuid(),
  /** When true, queue privacy blur for this upload if org allows blur and user is allowed (see ss_blur_allowed). */
  request_blur: z.boolean().optional(),
})

export async function screenshotConfirmRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.post('/confirm', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = confirmSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const screenshot = await prisma.screenshot.findFirst({
        where: { id: body.data.upload_id, user_id: user.id, org_id: user.org_id },
      })
      if (!screenshot) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Screenshot not found' })
      }

      // Verify file actually exists in S3
      const exists = await objectExists(opts.config, screenshot.s3_key)
      if (!exists) {
        return reply.status(422).send({
          code: 'S3_OBJECT_NOT_FOUND',
          message: 'File not found in S3 — upload may have failed',
        })
      }

      if (screenshot.thumb_s3_key) {
        const thumbExists = await objectExists(opts.config, screenshot.thumb_s3_key)
        if (!thumbExists) {
          return reply.status(422).send({
            code: 'S3_THUMB_NOT_FOUND',
            message: 'Thumbnail not found in S3 — upload may have failed',
          })
        }
      }

      // Mark confirmed — no separate confirmed flag needed since we verified S3
      const confirmed = await prisma.screenshot.update({
        where: { id: screenshot.id },
        data: { updated_at: new Date() },
      })

      // Opt-in blur: org enables the feature; user requests blur for this upload; admin may deny via ss_blur_allowed override.
      const orgSettings = await prisma.orgSettings.findFirst({
        where: { org_id: user.org_id },
      })
      const requestBlur = body.data.request_blur === true
      const userMayBlur =
        orgSettings?.blur_screenshots === true &&
        (await resolveFeature(user.org_id, user.id, 'ss_blur_allowed')) === 'true'
      if (requestBlur && userMayBlur) {
        const { getScreenshotQueue } = await import('../../queues/index.js')
        const queue = getScreenshotQueue()
        await queue.add(
          'process-screenshot',
          { screenshotId: screenshot.id, s3Key: screenshot.s3_key, orgId: user.org_id },
          { jobId: `screenshot-${screenshot.id}`, attempts: 3 }
        )
      }

      return { screenshot: confirmed }
    },
  })
}
