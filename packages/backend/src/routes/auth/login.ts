import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { comparePassword, hashRefreshToken } from '../../lib/password.js'
import { issueAccessToken, createRefreshToken, issueMfaPendingToken } from '../../lib/jwt.js'
import type { Config } from '../../config.js'
import { toPublicOrgSettings } from '../../lib/org-settings-fields.js'

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
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

      const user = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          ...(org_slug && { organization: { slug: org_slug } }),
        },
        include: { organization: true },
      })

      const org = user?.organization

      if (!user || !org) {
        return reply.status(401).send({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        })
      }

      if ((org.status as string) === 'SUSPENDED') {
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

      const valid = await comparePassword(password, user.password_hash)
      if (!valid) {
        return reply.status(401).send({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        })
      }

      const orgSettingsForMfa = await prisma.orgSettings.findUnique({
        where: { org_id: org.id },
        select: { mfa_required_for_admins: true, mfa_required_for_managers: true },
      })
      const mfaPolicyRequired =
        (user.role === 'ADMIN' && orgSettingsForMfa?.mfa_required_for_admins) ||
        (user.role === 'MANAGER' && orgSettingsForMfa?.mfa_required_for_managers) ||
        (user.role === 'OWNER' && orgSettingsForMfa?.mfa_required_for_admins)

      if (mfaPolicyRequired && !user.mfa_enabled) {
        return reply.status(403).send({
          code: 'MFA_SETUP_REQUIRED',
          message: 'Your organization requires MFA for your role. Enable MFA before signing in.',
        })
      }

      if (
        user.mfa_enabled &&
        (user.mfa_secret || (user.mfa_secret_encrypted && user.mfa_secret_encrypted.length > 0))
      ) {
        const mfaToken = await issueMfaPendingToken(user.id, org.id)
        return reply.send({ mfa_required: true, mfa_token: mfaToken })
      }

      const accessToken = await issueAccessToken(
        user.id,
        org.id,
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

      const orgSettings = await prisma.orgSettings.findUnique({
        where: { org_id: org.id },
      })

      return reply.send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          org_id: org.id,
          org_name: org.name,
          is_platform_admin: user.is_platform_admin,
        },
        org_settings: toPublicOrgSettings(orgSettings),
      })
    }
  )
}
