import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { getRedis } from '../../db/redis.js'
import type { Config } from '../../config.js'

export async function verifyEmailRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts

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
    async (
      request: FastifyRequest<{ Querystring: { token?: string } }>,
      reply: FastifyReply
    ) => {
      const { token } = request.query
      if (!token) {
        return reply.status(400).send({ code: 'MISSING_TOKEN', message: 'Verification token is required' })
      }

      const redis = getRedis(config)
      const userId = await redis.get(`email:verify:${token}`)

      if (!userId) {
        return reply.status(400).send({
          code: 'INVALID_TOKEN',
          message: 'Verification token is invalid or has expired',
        })
      }

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        await redis.del(`email:verify:${token}`)
        return reply.status(400).send({ code: 'USER_NOT_FOUND', message: 'User not found' })
      }

      await redis.del(`email:verify:${token}`)

      return reply.send({ message: 'Email verified successfully. You can now log in.' })
    }
  )
}
