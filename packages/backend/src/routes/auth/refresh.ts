import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { hashRefreshToken, hashPassword } from '../../lib/password.js'
import { issueAccessToken, createRefreshToken } from '../../lib/jwt.js'
import type { Config } from '../../config.js'

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refresh_token'],
    properties: {
      refresh_token: { type: 'string' },
    },
  },
}

export async function refreshRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  fastify.post<{ Body: { refresh_token: string } }>(
    '/refresh',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: refreshSchema,
    },
    async (request: FastifyRequest<{ Body: { refresh_token: string } }>, reply: FastifyReply) => {
      const { refresh_token } = request.body

      // Direct lookup by SHA-256 hash — O(1) instead of O(n) bcrypt scan
      const tokenHash = hashRefreshToken(refresh_token)
      const matchedToken = await prisma.refreshToken.findFirst({
        where: { token_hash: tokenHash, expires_at: { gt: new Date() } },
        include: { user: { include: { organization: true } } },
      })

      if (!matchedToken) {
        return reply.status(401).send({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        })
      }

      const { user } = matchedToken

      if (user.status !== 'active' || user.organization.status === 'suspended') {
        await prisma.refreshToken.deleteMany({ where: { id: matchedToken.id } })
        return reply.status(402).send({
          code: 'ORG_SUSPENDED',
          message: 'Organization access has been suspended',
        })
      }

      // deleteMany doesn't throw if record was already deleted (e.g. concurrent refresh)
      const { count } = await prisma.refreshToken.deleteMany({ where: { id: matchedToken.id } })
      if (count === 0) {
        return reply.status(401).send({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        })
      }

      const newAccessToken = await issueAccessToken(user.id, user.org_id, user.role)
      const newRefreshToken = createRefreshToken()
      const newTokenHash = hashRefreshToken(newRefreshToken)

      await prisma.refreshToken.create({
        data: {
          user_id: user.id,
          token_hash: newTokenHash,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      return reply.send({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      })
    }
  )
}
