import type { FastifyInstance } from 'fastify'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { canAccessOrgUser } from '../../lib/permissions.js'
import { getS3Client } from '../../lib/s3.js'

export async function screenshotFileRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/:id/file', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const shot = await prisma.screenshot.findFirst({
        where: { id, org_id: user.org_id, deleted_at: null },
        select: { id: true, user_id: true, s3_key: true },
      })
      if (!shot) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Screenshot not found' })
      }

      const canView = shot.user_id === user.id || (await canAccessOrgUser(user, shot.user_id))
      if (!canView) {
        return reply
          .status(403)
          .send({ code: 'FORBIDDEN', message: 'Not allowed to view this screenshot' })
      }

      const s3 = getS3Client(opts.config)
      const out = await s3.send(
        new GetObjectCommand({
          Bucket: opts.config.S3_SCREENSHOT_BUCKET,
          Key: shot.s3_key,
        })
      )
      if (!out.Body) {
        return reply.status(502).send({ code: 'S3_EMPTY', message: 'No object body' })
      }

      reply.header('Content-Type', out.ContentType ?? 'image/webp')
      reply.header('Cache-Control', 'private, max-age=120')
      return reply.send(out.Body)
    },
  })
}
