import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { getRedis } from '../../db/redis.js'
import type { Config } from '../../config.js'
import { enqueueTransactionalEmail } from '../../services/email/enqueue.js'
import {
  EMAIL_VERIFY_CONSUMED_TTL_SEC,
  emailVerifyConsumedKey,
} from '../../lib/email-verification-token.js'

export async function verifyEmailRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const appUrl = config.APP_URL

  fastify.get<{ Querystring: { token?: string } }>(
    '/verify-email',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
      const { token } = request.query
      if (!token) {
        return reply
          .status(400)
          .send({ code: 'MISSING_TOKEN', message: 'Verification token is required' })
      }

      const redis = getRedis(config)

      // Idempotent replay: first request consumed the token; duplicate GET (e.g. React Strict Mode in dev)
      // must still return success so the UI matches an already-verified account.
      const replayUserId = await redis.get(emailVerifyConsumedKey(token))
      if (replayUserId) {
        const replayUser = await prisma.user.findUnique({
          where: { id: replayUserId },
          select: { email_verified: true },
        })
        if (replayUser?.email_verified) {
          return reply.send({ message: 'Email verified successfully. You can now log in.' })
        }
      }

      let userId = await redis.get(`email:verify:${token}`)

      if (!userId) {
        const pending = await prisma.emailVerificationToken.findFirst({
          where: { token, expires_at: { gt: new Date() } },
          select: { user_id: true },
        })
        userId = pending?.user_id ?? null
      }

      if (!userId) {
        return reply.status(400).send({
          code: 'INVALID_TOKEN',
          message: 'Verification token is invalid or has expired',
        })
      }

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        await redis.del(`email:verify:${token}`)
        await prisma.emailVerificationToken.deleteMany({ where: { token } })
        return reply.status(400).send({ code: 'USER_NOT_FOUND', message: 'User not found' })
      }

      await redis.del(`email:verify:${token}`)
      await prisma.emailVerificationToken.deleteMany({ where: { token } })

      const alreadyVerified = user.email_verified

      // Mark the account as email-verified so login is now permitted.
      if (!alreadyVerified) {
        await prisma.user.update({
          where: { id: userId },
          data: { email_verified: true },
        })
      }

      await redis.set(emailVerifyConsumedKey(token), userId, 'EX', EMAIL_VERIFY_CONSUMED_TTL_SEC)

      if (!alreadyVerified) {
        void enqueueTransactionalEmail({
          kind: 'welcome',
          to: user.email,
          appUrl,
          userName: user.name,
        }).catch((err) => fastify.log.error({ err }, 'Failed to enqueue welcome email'))
      }

      return reply.send({ message: 'Email verified successfully. You can now log in.' })
    }
  )
}
