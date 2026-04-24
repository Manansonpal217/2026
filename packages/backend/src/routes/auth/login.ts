import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { comparePassword, hashRefreshToken } from '../../lib/password.js'
import { issueAccessToken, createRefreshToken } from '../../lib/jwt.js'
import type { Config } from '../../config.js'
import { toPublicOrgSettings } from '../../lib/org-settings-fields.js'
import { normalizeUserEmail } from '../../lib/user-email-availability.js'

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      // Avoid AJV `format: email` rejecting dev domains like `user@dev.local`.
      email: { type: 'string', minLength: 3, maxLength: 320 },
      password: { type: 'string', minLength: 1 },
      org_slug: { type: 'string' },
    },
  },
}

export async function loginRoutes(fastify: FastifyInstance, _opts: { config: Config }) {
  fastify.post<{
    Body: { email: string; password: string; org_slug?: string }
  }>(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: loginSchema,
    },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string; org_slug?: string } }>,
      reply: FastifyReply
    ) => {
      const { email, password, org_slug } = request.body
      const emailLower = normalizeUserEmail(email)
      const orgSlug = org_slug?.trim()

      // Sign-in identifier must be an email (not display name / username).
      const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)
      if (!emailLooksValid) {
        return reply.status(400).send({
          code: 'EMAIL_REQUIRED',
          message: 'Sign in with your work email address.',
        })
      }

      const user = await prisma.user.findFirst({
        where: orgSlug
          ? { email: emailLower, organization: { slug: orgSlug } }
          : { email: emailLower },
        include: { organization: true },
      })

      const org = user?.organization
      const isPlatformAdmin = user?.is_platform_admin === true

      if (!user || (!org && !isPlatformAdmin)) {
        return reply.status(401).send({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        })
      }

      if (org && (org.status as string) === 'SUSPENDED') {
        return reply.status(402).send({
          code: 'ORG_SUSPENDED',
          message: 'Organization access has been suspended',
        })
      }

      if ((user.status as string) !== 'ACTIVE') {
        return reply.status(401).send({
          code: 'USER_INACTIVE',
          message: 'Your account is not active',
        })
      }

      // Verify password before revealing whether the email is verified,
      // so we don't leak account existence on unverified accounts.
      const validBeforeVerify = await comparePassword(password, user.password_hash)
      if (!validBeforeVerify) {
        return reply.status(401).send({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        })
      }

      if (!user.email_verified && !isPlatformAdmin) {
        return reply.status(403).send({
          code: 'EMAIL_NOT_VERIFIED',
          message:
            'This account is not ready to sign in yet. Check your inbox for the verification or set-password link from TrackSync, then try again.',
        })
      }

      const orgId = org?.id ?? null

      const accessToken = await issueAccessToken(
        user.id,
        orgId,
        user.role as string,
        user.role_version
      )
      const refreshToken = createRefreshToken()
      const tokenHash = hashRefreshToken(refreshToken)

      await prisma.refreshToken.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      const orgSettings = org
        ? await prisma.orgSettings.findUnique({ where: { org_id: org.id } })
        : null

      return reply.send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          org_id: orgId ?? '',
          org_name: org?.name ?? '',
          is_platform_admin: user.is_platform_admin,
        },
        org_settings: toPublicOrgSettings(orgSettings),
      })
    }
  )
}
