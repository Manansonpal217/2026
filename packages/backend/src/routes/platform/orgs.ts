import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { getRedis } from '../../db/redis.js'
import { hashPassword } from '../../lib/password.js'
import { sendVerificationEmail } from '../../lib/email.js'
import {
  createOrgWithSuperAdmin,
  isDisposableSignupEmail,
} from '../../lib/create-org-with-super-admin.js'
import { logAuditEvent } from '../../lib/audit.js'
import {
  createAuthenticateMiddleware,
  requirePlatformAdmin,
} from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const listOrgsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const createOrgBody = z.object({
  org_name: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(40),
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  data_region: z.string().optional(),
})

const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['active', 'suspended', 'invited']).optional(),
  role: z.string().optional(),
  search: z.string().optional(),
})

const createOrgUserBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  /** Org-level roles only; does not grant platform admin (`is_platform_admin`). */
  role: z.enum(['super_admin', 'admin', 'manager', 'employee']),
})

export async function platformOrgRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const authenticate = createAuthenticateMiddleware(config)

  fastify.get(
    '/orgs',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
    },
    async (request: FastifyRequest) => {
      const parsed = listOrgsQuery.safeParse(request.query)
      const q = parsed.success ? parsed.data : { page: 1, limit: 50 }
      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            plan: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        prisma.organization.count(),
      ])
      return { organizations, total, page: q.page, limit: q.limit }
    }
  )

  fastify.post<{
    Body: z.infer<typeof createOrgBody>
  }>(
    '/orgs',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof createOrgBody> }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest
      const body = createOrgBody.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }
      const { org_name, slug, full_name, email, password, data_region } = body.data

      const existing = await prisma.organization.findUnique({
        where: { slug: slug.toLowerCase() },
      })
      if (existing) {
        return reply.status(400).send({
          code: 'SLUG_TAKEN',
          message: 'Organization slug is already taken',
        })
      }

      const password_hash = await hashPassword(password)
      let userId = ''

      try {
        await prisma.$transaction(async (tx) => {
          const { userId: uid } = await createOrgWithSuperAdmin(tx, {
            org_name,
            slug,
            full_name,
            email,
            password_hash,
            data_region,
          })
          userId = uid
        })
      } catch (err: unknown) {
        const errObj = err as { code?: string }
        if (errObj?.code === 'DISPOSABLE_EMAIL') {
          return reply.status(400).send({
            code: 'DISPOSABLE_EMAIL',
            message: 'Please use a work email address',
          })
        }
        if (errObj?.code === 'P2002') {
          return reply.status(400).send({
            code: 'SLUG_TAKEN',
            message: 'Organization slug is already taken',
          })
        }
        throw err
      }

      const org = await prisma.organization.findFirst({
        where: { slug: slug.toLowerCase() },
        select: { id: true, name: true, slug: true },
      })

      if (org) {
        await logAuditEvent({
          orgId: org.id,
          actorId: req.user!.id,
          action: 'platform.org_created',
          targetType: 'organization',
          targetId: org.id,
          newValue: { name: org.name, slug: org.slug },
          ip: request.ip,
        })
      }

      const verifyToken = randomUUID()
      const redis = getRedis(config)
      await redis.set(`email:verify:${verifyToken}`, userId, 'EX', 86400)

      sendVerificationEmail(config, email.toLowerCase(), verifyToken).catch((err) =>
        fastify.log.error({ err }, 'Failed to send verification email')
      )

      return reply.status(201).send({
        message: 'Organization created. Verification email sent to the admin user.',
        organization: org,
        user_id: userId,
      })
    }
  )

  fastify.get(
    '/orgs/:orgId/users',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true },
      })
      if (!org) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Organization not found' })
      }

      const parsed = listUsersQuery.safeParse(request.query)
      const query = parsed.success ? parsed.data : { page: 1, limit: 50 }

      const where = {
        org_id: orgId,
        ...(query.status && { status: query.status }),
        ...(query.role && { role: query.role }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }),
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            created_at: true,
            mfa_enabled: true,
          },
          orderBy: { created_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.user.count({ where }),
      ])

      return { users, total, page: query.page, limit: query.limit }
    }
  )

  fastify.post(
    '/orgs/:orgId/users',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const { orgId } = request.params as { orgId: string }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, status: true },
      })
      if (!org) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Organization not found' })
      }
      if (org.status === 'suspended') {
        return reply.status(402).send({
          code: 'ORG_SUSPENDED',
          message: 'Organization access has been suspended',
        })
      }

      const parsed = createOrgUserBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { name, email, password, role } = parsed.data
      const emailLower = email.toLowerCase()

      if (isDisposableSignupEmail(emailLower)) {
        return reply.status(400).send({
          code: 'DISPOSABLE_EMAIL',
          message: 'Please use a work email address',
        })
      }

      const existingUser = await prisma.user.findFirst({
        where: { email: emailLower, org_id: orgId },
      })
      if (existingUser) {
        return reply.status(409).send({
          code: 'USER_EXISTS',
          message: 'A user with this email already exists in this organization',
        })
      }

      const password_hash = await hashPassword(password)

      let user
      try {
        user = await prisma.user.create({
          data: {
            org_id: orgId,
            email: emailLower,
            password_hash,
            name,
            role,
            status: 'active',
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            created_at: true,
            mfa_enabled: true,
          },
        })
      } catch (err: unknown) {
        const errObj = err as { code?: string }
        if (errObj?.code === 'P2002') {
          return reply.status(409).send({
            code: 'USER_EXISTS',
            message: 'A user with this email already exists in this organization',
          })
        }
        throw err
      }

      await logAuditEvent({
        orgId,
        actorId: req.user!.id,
        action: 'platform.user_created',
        targetType: 'user',
        targetId: user.id,
        newValue: { email: user.email, role: user.role, org_id: orgId },
        ip: request.ip,
      })

      return reply.status(201).send({ user })
    }
  )
}
