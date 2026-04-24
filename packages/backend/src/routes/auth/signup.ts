import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { prisma } from '../../db/prisma.js'
import { getRedis } from '../../db/redis.js'
import { hashPassword } from '../../lib/password.js'
import { enqueueTransactionalEmail } from '../../services/email/enqueue.js'
import {
  createOrgWithSuperAdmin,
  isDisposableSignupEmail,
} from '../../lib/create-org-with-super-admin.js'
import { allocateUniqueOrgSlug, isPrismaUniqueOnOrganizationSlug } from '../../lib/org-slug.js'
import type { Config } from '../../config.js'
import { storeEmailVerificationToken } from '../../lib/email-verification-token.js'
import {
  findRegisteredUserByEmail,
  isPrismaUniqueOnUserEmail,
} from '../../lib/user-email-availability.js'

const signupSchema = {
  body: {
    type: 'object',
    required: ['org_name', 'full_name', 'email', 'password'],
    properties: {
      org_name: { type: 'string', minLength: 1 },
      full_name: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      data_region: { type: 'string' },
    },
  },
}

export async function signupRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts

  fastify.post<{
    Body: {
      org_name: string
      full_name: string
      email: string
      password: string
      data_region?: string
    }
  }>(
    '/signup',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: signupSchema,
    },
    async (
      request: FastifyRequest<{
        Body: {
          org_name: string
          full_name: string
          email: string
          password: string
          data_region?: string
        }
      }>,
      reply: FastifyReply
    ) => {
      const { org_name, full_name, email, password, data_region } = request.body

      if (isDisposableSignupEmail(email)) {
        return reply.status(400).send({
          code: 'DISPOSABLE_EMAIL',
          message: 'Please use a work email address',
        })
      }

      const password_hash = await hashPassword(password)

      const existingAccount = await findRegisteredUserByEmail(prisma, email)
      if (existingAccount) {
        return reply.status(409).send({
          code: 'EMAIL_IN_USE',
          message: 'This email is already registered on TrackSync.',
        })
      }

      let userId: string = ''

      const maxSlugAttempts = 8
      for (let attempt = 0; attempt < maxSlugAttempts; attempt++) {
        const slug = await allocateUniqueOrgSlug(prisma, org_name)
        try {
          await prisma.$transaction(async (tx) => {
            const { userId: createdUserId } = await createOrgWithSuperAdmin(tx, {
              org_name,
              slug,
              full_name,
              email,
              password_hash,
              data_region,
            })
            userId = createdUserId
          })
          break
        } catch (err: unknown) {
          const errObj = err as { code?: string }
          if (errObj?.code === 'DISPOSABLE_EMAIL') {
            return reply.status(400).send({
              code: 'DISPOSABLE_EMAIL',
              message: 'Please use a work email address',
            })
          }
          if (errObj?.code === 'P2002' && isPrismaUniqueOnOrganizationSlug(err)) {
            if (attempt === maxSlugAttempts - 1) {
              return reply.status(409).send({
                code: 'SLUG_ALLOCATION_FAILED',
                message: 'Could not assign a unique organization URL slug. Try again.',
              })
            }
            continue
          }
          if (errObj?.code === 'EMAIL_IN_USE') {
            return reply.status(409).send({
              code: 'EMAIL_IN_USE',
              message: 'This email is already registered on TrackSync.',
            })
          }
          if (errObj?.code === 'P2002') {
            if (isPrismaUniqueOnUserEmail(err)) {
              return reply.status(409).send({
                code: 'EMAIL_IN_USE',
                message: 'This email is already registered on TrackSync.',
              })
            }
            return reply.status(400).send({
              code: 'SLUG_TAKEN',
              message: 'Organization slug is already taken',
            })
          }
          throw err
        }
      }

      const verifyToken = randomUUID()
      await storeEmailVerificationToken(prisma, getRedis(config), userId, verifyToken)

      void enqueueTransactionalEmail({
        kind: 'verify',
        to: email.toLowerCase(),
        appUrl: config.APP_URL,
        userName: full_name,
        token: verifyToken,
      }).catch((err) => fastify.log.error({ err }, 'Failed to enqueue verification email'))

      return reply.status(201).send({
        message: 'Organization created. Please check your email to verify your account.',
      })
    }
  )
}
