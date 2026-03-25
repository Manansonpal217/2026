import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomBytes } from 'crypto'
import { prisma } from '../../db/prisma.js'
import { getRedis } from '../../db/redis.js'
import { hashPassword } from '../../lib/password.js'
import { sendPasswordResetEmail } from '../../lib/email.js'
import type { Config } from '../../config.js'

const GENERIC_OK_MESSAGE =
  'If an account exists for this email, we sent password reset instructions.'

const RESET_TTL_SEC = 3600

const forgotSchema = {
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email' },
      org_slug: { type: 'string' },
    },
  },
}

const resetSchema = {
  body: {
    type: 'object',
    required: ['token', 'password'],
    properties: {
      token: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 8 },
    },
  },
}

function normalizeOrgSlug(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const t = raw.trim().toLowerCase()
  return t.length > 0 ? t : undefined
}

export async function passwordResetRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts

  fastify.post<{
    Body: { email: string; org_slug?: string }
  }>(
    '/forgot-password',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: forgotSchema,
    },
    async (
      request: FastifyRequest<{ Body: { email: string; org_slug?: string } }>,
      reply: FastifyReply
    ) => {
      const email = request.body.email.toLowerCase()
      const orgSlug = normalizeOrgSlug(request.body.org_slug)

      const candidates = await prisma.user.findMany({
        where: {
          email,
          status: 'active',
          organization: {
            status: { not: 'suspended' },
            ...(orgSlug ? { slug: orgSlug } : {}),
          },
        },
        select: { id: true, email: true },
      })

      let targetId: string | null = null
      if (candidates.length === 1) {
        targetId = candidates[0].id
      }

      if (targetId) {
        const token = randomBytes(32).toString('hex')
        const redis = getRedis(config)
        await redis.set(`password:reset:${token}`, targetId, 'EX', RESET_TTL_SEC)
        const userRow = candidates[0]
        sendPasswordResetEmail(config, userRow.email, token).catch((err) =>
          fastify.log.error({ err }, 'Failed to send password reset email')
        )
      }

      return reply.send({ message: GENERIC_OK_MESSAGE })
    }
  )

  fastify.post<{
    Body: { token: string; password: string }
  }>(
    '/reset-password',
    {
      config: { rateLimit: { max: 15, timeWindow: '15 minutes' } },
      schema: resetSchema,
    },
    async (
      request: FastifyRequest<{ Body: { token: string; password: string } }>,
      reply: FastifyReply
    ) => {
      const { token, password } = request.body
      const redis = getRedis(config)
      const userId = await redis.get(`password:reset:${token}`)

      if (!userId) {
        return reply.status(400).send({
          code: 'INVALID_TOKEN',
          message: 'Reset link is invalid or has expired. Request a new password reset.',
        })
      }

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        await redis.del(`password:reset:${token}`)
        return reply.status(400).send({
          code: 'USER_NOT_FOUND',
          message: 'Reset link is invalid or has expired. Request a new password reset.',
        })
      }

      const password_hash = await hashPassword(password)
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { password_hash },
        }),
        prisma.refreshToken.deleteMany({ where: { user_id: user.id } }),
      ])

      await redis.del(`password:reset:${token}`)

      return reply.send({
        message: 'Your password has been updated. You can sign in with your new password.',
      })
    }
  )
}
