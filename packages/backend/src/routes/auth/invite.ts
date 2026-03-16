import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { hashPassword, hashRefreshToken } from '../../lib/password.js'
import { issueAccessToken, createRefreshToken } from '../../lib/jwt.js'
import { sendInviteEmail } from '../../lib/email.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const VALID_ROLES = ['admin', 'manager', 'employee']

export async function inviteRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const authenticate = createAuthenticateMiddleware(config)

  fastify.post<{ Body: { email: string; role?: string } }>(
    '/invite',
    {
      preHandler: [authenticate, requireRole('super_admin', 'admin')],
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: VALID_ROLES },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { email: string; role?: string } }>, reply: FastifyReply) => {
      const { email, role = 'employee' } = request.body
      const requester = (request as AuthenticatedRequest).user!

      const existingUser = await prisma.user.findFirst({
        where: { email: email.toLowerCase(), org_id: requester.org_id },
      })
      if (existingUser) {
        return reply.status(409).send({
          code: 'USER_EXISTS',
          message: 'A user with this email already exists in your organization',
        })
      }

      const existingInvite = await prisma.invite.findFirst({
        where: {
          email: email.toLowerCase(),
          org_id: requester.org_id,
          accepted_at: null,
          expires_at: { gt: new Date() },
        },
      })
      if (existingInvite) {
        return reply.status(409).send({
          code: 'INVITE_EXISTS',
          message: 'An active invite already exists for this email',
        })
      }

      const invite = await prisma.invite.create({
        data: {
          org_id: requester.org_id,
          email: email.toLowerCase(),
          role,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        include: { organization: true },
      })

      sendInviteEmail(
        config,
        invite.email,
        invite.token,
        invite.organization.name,
        requester.name
      ).catch((err) => fastify.log.error({ err }, 'Failed to send invite email'))

      return reply.status(201).send({ invite_id: invite.id, message: 'Invitation sent' })
    }
  )

  fastify.post<{
    Body: { token: string; full_name: string; password: string }
  }>(
    '/invite/accept',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'full_name', 'password'],
          properties: {
            token: { type: 'string' },
            full_name: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { token: string; full_name: string; password: string } }>,
      reply: FastifyReply
    ) => {
      const { token, full_name, password } = request.body

      const invite = await prisma.invite.findUnique({
        where: { token },
        include: { organization: true },
      })

      if (!invite) {
        return reply.status(400).send({ code: 'INVALID_INVITE', message: 'Invite not found' })
      }

      if (invite.accepted_at) {
        return reply.status(400).send({ code: 'INVITE_USED', message: 'This invite has already been accepted' })
      }

      if (invite.expires_at < new Date()) {
        return reply.status(400).send({ code: 'INVITE_EXPIRED', message: 'This invite has expired' })
      }

      if (invite.organization.status === 'suspended') {
        return reply.status(402).send({ code: 'ORG_SUSPENDED', message: 'Organization access has been suspended' })
      }

      const existingUser = await prisma.user.findFirst({
        where: { email: invite.email, org_id: invite.org_id },
      })
      if (existingUser) {
        return reply.status(409).send({ code: 'USER_EXISTS', message: 'A user with this email already exists' })
      }

      const password_hash = await hashPassword(password)

      const refreshToken = createRefreshToken()
      const tokenHash = hashRefreshToken(refreshToken)

      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            org_id: invite.org_id,
            email: invite.email,
            password_hash,
            name: full_name,
            role: invite.role,
            status: 'active',
          },
        })
        await tx.invite.update({
          where: { id: invite.id },
          data: { accepted_at: new Date() },
        })
        await tx.refreshToken.create({
          data: {
            user_id: newUser.id,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })
        return newUser
      })

      const accessToken = await issueAccessToken(user.id, invite.org_id, user.role)

      return reply.status(201).send({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          org_id: invite.org_id,
          org_name: invite.organization.name,
        },
      })
    }
  )

  fastify.get<{ Querystring: { token?: string } }>(
    '/invite/info',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['token'],
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
        return reply.status(400).send({ code: 'MISSING_TOKEN', message: 'Token is required' })
      }

      const invite = await prisma.invite.findUnique({
        where: { token },
        include: { organization: true },
      })

      if (!invite || invite.accepted_at || invite.expires_at < new Date()) {
        return reply.status(400).send({ code: 'INVALID_INVITE', message: 'Invite is invalid or expired' })
      }

      return reply.send({
        email: invite.email,
        org_name: invite.organization.name,
        role: invite.role,
        expires_at: invite.expires_at,
      })
    }
  )
}
