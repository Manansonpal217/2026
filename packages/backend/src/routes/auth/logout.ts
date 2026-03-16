import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { verifyToken } from '../../lib/jwt.js'
import { getRedis, blacklistJti } from '../../db/redis.js'
import { hashRefreshToken } from '../../lib/password.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function logoutRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const redis = getRedis(config)
  const authenticate = createAuthenticateMiddleware(config)

  fastify.post(
    '/logout',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: { refresh_token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = request.headers.authorization
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

      if (token) {
        try {
          const payload = await verifyToken(token)
          const ttl = payload.exp - Math.floor(Date.now() / 1000)
          await blacklistJti(redis, payload.jti, ttl)
        } catch {
          // Token may already be expired, ignore
        }
      }

      const { refresh_token } = (request.body as { refresh_token?: string }) || {}
      const user = (request as AuthenticatedRequest).user

      if (user && refresh_token) {
        // Direct lookup by SHA-256 hash — no O(n) scan
        const tokenHash = hashRefreshToken(refresh_token)
        await prisma.refreshToken.deleteMany({
          where: { user_id: user.id, token_hash: tokenHash },
        })
      } else if (user) {
        await prisma.refreshToken.deleteMany({
          where: { user_id: user.id },
        })
      }

      return reply.send({ message: 'Logged out' })
    }
  )
}
