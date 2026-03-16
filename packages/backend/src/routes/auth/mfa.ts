import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { comparePassword, hashRefreshToken } from '../../lib/password.js'
import {
  issueAccessToken,
  createRefreshToken,
  verifyMfaPendingToken,
} from '../../lib/jwt.js'
import {
  generateSecret,
  generateTotpUri,
  generateQrCodeDataUrl,
  verifyTotp,
  generateBackupCodes,
  formatBackupCode,
} from '../../lib/mfa.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function mfaRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const authenticate = createAuthenticateMiddleware(config)

  // POST /mfa/verify — complete login after MFA (no auth required, uses mfa_token)
  fastify.post<{ Body: { mfa_token: string; totp_code: string } }>(
    '/mfa/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['mfa_token', 'totp_code'],
          properties: {
            mfa_token: { type: 'string' },
            totp_code: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { mfa_token: string; totp_code: string } }>,
      reply: FastifyReply
    ) => {
      const { mfa_token, totp_code } = request.body

      let pending
      try {
        pending = await verifyMfaPendingToken(mfa_token)
      } catch {
        return reply.status(401).send({ code: 'INVALID_MFA_TOKEN', message: 'MFA token is invalid or expired' })
      }

      const user = await prisma.user.findUnique({
        where: { id: pending.sub },
        include: { organization: true },
      })

      if (!user || !user.mfa_secret) {
        return reply.status(401).send({ code: 'MFA_NOT_SETUP', message: 'MFA is not configured' })
      }

      if (user.organization.status === 'suspended') {
        return reply.status(402).send({ code: 'ORG_SUSPENDED', message: 'Organization access has been suspended' })
      }

      const isBackupCode = user.mfa_backup_codes.includes(totp_code.toUpperCase().replace('-', ''))
      const isTotpValid = await verifyTotp(totp_code, user.mfa_secret)

      if (!isBackupCode && !isTotpValid) {
        return reply.status(401).send({ code: 'INVALID_TOTP', message: 'Invalid TOTP code' })
      }

      if (isBackupCode) {
        const remaining = user.mfa_backup_codes.filter(
          (c) => c !== totp_code.toUpperCase().replace('-', '')
        )
        await prisma.user.update({
          where: { id: user.id },
          data: { mfa_backup_codes: remaining },
        })
      }

      const accessToken = await issueAccessToken(user.id, user.org_id, user.role)
      const refreshToken = createRefreshToken()
      const tokenHash = hashRefreshToken(refreshToken)

      await prisma.refreshToken.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      return reply.send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          org_id: user.org_id,
          org_name: user.organization.name,
        },
      })
    }
  )

  // POST /mfa/setup — generate secret + QR code (authenticated)
  fastify.post(
    '/mfa/setup',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authReq = request as AuthenticatedRequest
      const user = await prisma.user.findUnique({ where: { id: authReq.user!.id } })
      if (!user) return reply.status(404).send({ code: 'NOT_FOUND' })

      if (user.mfa_enabled) {
        return reply.status(400).send({ code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled' })
      }

      const secret = generateSecret()
      const uri = generateTotpUri(user.email, secret)
      const qr_code_url = await generateQrCodeDataUrl(uri)

      await prisma.user.update({ where: { id: user.id }, data: { mfa_secret: secret } })

      return reply.send({ qr_code_url, secret, uri })
    }
  )

  // POST /mfa/enable — verify TOTP then activate MFA (authenticated)
  fastify.post<{ Body: { totp_code: string } }>(
    '/mfa/enable',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['totp_code'],
          properties: { totp_code: { type: 'string' } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { totp_code: string } }>,
      reply: FastifyReply
    ) => {
      const authReq = request as AuthenticatedRequest
      const user = await prisma.user.findUnique({ where: { id: authReq.user!.id } })
      if (!user || !user.mfa_secret) {
        return reply.status(400).send({ code: 'MFA_NOT_SETUP', message: 'Call /mfa/setup first' })
      }

      if (!(await verifyTotp(request.body.totp_code, user.mfa_secret))) {
        return reply.status(401).send({ code: 'INVALID_TOTP', message: 'Invalid TOTP code' })
      }

      const rawCodes = generateBackupCodes(8)
      const formatted = rawCodes.map(formatBackupCode)

      await prisma.user.update({
        where: { id: user.id },
        data: { mfa_enabled: true, mfa_backup_codes: rawCodes },
      })

      return reply.send({ message: 'MFA enabled', backup_codes: formatted })
    }
  )

  // POST /mfa/disable — require current password + TOTP (authenticated)
  fastify.post<{ Body: { password: string; totp_code: string } }>(
    '/mfa/disable',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['password', 'totp_code'],
          properties: {
            password: { type: 'string' },
            totp_code: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { password: string; totp_code: string } }>,
      reply: FastifyReply
    ) => {
      const authReq = request as AuthenticatedRequest
      const user = await prisma.user.findUnique({ where: { id: authReq.user!.id } })
      if (!user) return reply.status(404).send({ code: 'NOT_FOUND' })
      if (!user.mfa_enabled) {
        return reply.status(400).send({ code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled' })
      }

      const passwordValid = await comparePassword(request.body.password, user.password_hash)
      if (!passwordValid) {
        return reply.status(401).send({ code: 'INVALID_CREDENTIALS', message: 'Invalid password' })
      }

      if (!(await verifyTotp(request.body.totp_code, user.mfa_secret!))) {
        return reply.status(401).send({ code: 'INVALID_TOTP', message: 'Invalid TOTP code' })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { mfa_enabled: false, mfa_secret: null, mfa_backup_codes: [] },
      })

      return reply.send({ message: 'MFA disabled' })
    }
  )
}
