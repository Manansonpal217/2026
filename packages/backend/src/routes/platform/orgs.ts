import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomBytes, randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { getRedis } from '../../db/redis.js'
import { hashPassword, hashRefreshToken } from '../../lib/password.js'
import { enqueueTransactionalEmail } from '../../services/email/enqueue.js'
import {
  createOrgWithSuperAdmin,
  isDisposableSignupEmail,
} from '../../lib/create-org-with-super-admin.js'
import { logAuditEvent } from '../../lib/audit.js'
import {
  createAuthenticateMiddleware,
  requirePlatformAdmin,
  requirePlatformAdminOrOrgSuperAdmin,
} from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import {
  orgSettingsScalarPatchSchema,
  workPlatformSchema,
  assertActivityWeightsSum,
} from '../../lib/org-settings-fields.js'
import { registerOrgReportJobs } from '../../lib/report-jobs.js'
import { allocateUniqueOrgSlug, isPrismaUniqueOnOrganizationSlug } from '../../lib/org-slug.js'
import { isPrismaUniqueOnUserEmail } from '../../lib/user-email-availability.js'
import { PASSWORD_RESET_TOKEN_TTL_SEC } from '../auth/password-reset.js'

const orgSettingsForCreateSchema = orgSettingsScalarPatchSchema.omit({ work_platform: true })

const listOrgsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const createOrgBody = z.object({
  org_name: z.string().min(1),
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  data_region: z.string().optional(),
  work_platform: workPlatformSchema.optional(),
  settings: orgSettingsForCreateSchema.optional(),
})

const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  role: z.string().optional(),
  search: z.string().optional(),
})

const createOrgUserBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  /** Org-level roles only; does not grant platform admin (`is_platform_admin`). */
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']),
})

const platformAgentTokenBody = z.object({
  name: z.string().max(100).optional(),
})

const patchOrgBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .min(2)
      .max(40)
      .optional(),
    plan: z.string().min(1).max(64).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.name !== undefined ||
      b.slug !== undefined ||
      b.plan !== undefined ||
      b.status !== undefined,
    {
      message: 'At least one field is required',
    }
  )

export async function platformOrgRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const { config } = opts
  const authenticate = createAuthenticateMiddleware(config)

  fastify.get(
    '/orgs',
    {
      preHandler: [authenticate, requirePlatformAdminOrOrgSuperAdmin()],
    },
    async (request: FastifyRequest) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const parsed = listOrgsQuery.safeParse(request.query)
      const q = parsed.success ? parsed.data : { page: 1, limit: 50 }

      // Org owners (OWNER role, non-platform-admin) may only see their own org.
      if (!user.is_platform_admin) {
        const org = await prisma.organization.findUnique({
          where: { id: user.org_id },
          select: { id: true, name: true, slug: true, status: true, plan: true, created_at: true },
        })
        return {
          organizations: org ? [org] : [],
          total: org ? 1 : 0,
          page: 1,
          limit: q.limit,
        }
      }

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
      const { org_name, full_name, email, data_region, work_platform, settings } = body.data

      try {
        if (settings) assertActivityWeightsSum(settings, null)
      } catch (e) {
        const err = e as { code?: string; message?: string }
        if (err.code === 'INVALID_WEIGHTS') {
          return reply.status(400).send({
            code: 'INVALID_WEIGHTS',
            message: err.message?.replace(/^INVALID_WEIGHTS: /, '') ?? 'Invalid weights',
          })
        }
        throw e
      }

      // Random hash until the admin sets their own password via the reset link (no known password).
      const password_hash = await hashPassword(randomBytes(32).toString('hex'))
      let userId = ''
      let slug = ''

      const maxSlugAttempts = 8
      for (let attempt = 0; attempt < maxSlugAttempts; attempt++) {
        slug = await allocateUniqueOrgSlug(prisma, org_name)
        try {
          await prisma.$transaction(async (tx) => {
            const { userId: uid } = await createOrgWithSuperAdmin(tx, {
              org_name,
              slug,
              full_name,
              email,
              password_hash,
              data_region,
              work_platform,
              settings,
            })
            userId = uid
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
          if (errObj?.code === 'EMAIL_IN_USE') {
            return reply.status(409).send({
              code: 'EMAIL_IN_USE',
              message: 'This email is already registered on TrackSync.',
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
          if (errObj?.code === 'P2002' && isPrismaUniqueOnUserEmail(err)) {
            return reply.status(409).send({
              code: 'EMAIL_IN_USE',
              message: 'This email is already registered on TrackSync.',
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
        // Register org report jobs with default UTC timezone (fire-and-forget)
        void registerOrgReportJobs(org.id, 'UTC').catch((err) =>
          fastify.log.error({ err }, 'Failed to register report jobs for new org')
        )
      }

      const redis = getRedis(config)
      const resetToken = randomBytes(32).toString('hex')
      await redis.set(`password:reset:${resetToken}`, userId, 'EX', PASSWORD_RESET_TOKEN_TTL_SEC)

      void enqueueTransactionalEmail({
        kind: 'welcomeSetPassword',
        to: email.toLowerCase(),
        appUrl: config.APP_URL,
        token: resetToken,
        orgName: org_name,
        recipientName: full_name,
      }).catch((err) =>
        fastify.log.error({ err }, 'Failed to enqueue admin welcome set-password email')
      )

      return reply.status(201).send({
        message:
          'Organization created. A secure link was emailed so the admin can set their password and sign in.',
        organization: org,
        user_id: userId,
      })
    }
  )

  fastify.patch<{
    Params: { orgId: string }
    Body: z.infer<typeof patchOrgBody>
  }>(
    '/orgs/:orgId',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const { orgId } = request.params as { orgId: string }
      const parsed = patchOrgBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          errors: parsed.error.flatten(),
        })
      }
      const body = parsed.data

      const existing = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
        },
      })
      if (!existing) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Organization not found' })
      }

      const slugLower = body.slug?.toLowerCase()
      if (slugLower && slugLower !== existing.slug) {
        const slugTaken = await prisma.organization.findUnique({
          where: { slug: slugLower },
          select: { id: true },
        })
        if (slugTaken) {
          return reply.status(400).send({
            code: 'SLUG_TAKEN',
            message: 'Organization slug is already taken',
          })
        }
      }

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(slugLower !== undefined && { slug: slugLower }),
          ...(body.plan !== undefined && {
            plan: body.plan as 'TRIAL' | 'FREE' | 'STANDARD' | 'PROFESSIONAL',
          }),
          ...(body.status !== undefined && { status: body.status }),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          plan: true,
          created_at: true,
        },
      })

      await logAuditEvent({
        orgId,
        actorId: req.user!.id,
        action: 'platform.org_updated',
        targetType: 'organization',
        targetId: orgId,
        oldValue: {
          name: existing.name,
          slug: existing.slug,
          plan: existing.plan,
          status: existing.status,
        },
        newValue: {
          name: updated.name,
          slug: updated.slug,
          plan: updated.plan,
          status: updated.status,
        },
        ip: request.ip,
      })

      return { organization: updated }
    }
  )

  fastify.get(
    '/orgs/:orgId/users',
    {
      preHandler: [authenticate, requirePlatformAdminOrOrgSuperAdmin()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { orgId } = request.params as { orgId: string }

      // Org owners (non-platform-admin) may only query users in their own org.
      if (!user.is_platform_admin && orgId !== user.org_id) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'You may only view users in your own organization',
        })
      }

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
        ...(query.role && {
          role: query.role as 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER',
        }),
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
      if ((org.status as string) === 'SUSPENDED') {
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
        where: { email: emailLower },
        select: { id: true },
      })
      if (existingUser) {
        return reply.status(409).send({
          code: 'EMAIL_IN_USE',
          message: 'This email is already registered on TrackSync.',
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
            status: 'ACTIVE',
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            created_at: true,
          },
        })
      } catch (err: unknown) {
        const errObj = err as { code?: string }
        if (errObj?.code === 'P2002' && isPrismaUniqueOnUserEmail(err)) {
          return reply.status(409).send({
            code: 'EMAIL_IN_USE',
            message: 'This email is already registered on TrackSync.',
          })
        }
        if (errObj?.code === 'P2002') {
          return reply.status(409).send({
            code: 'USER_EXISTS',
            message: 'Could not create user due to a unique constraint conflict.',
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

  /** Mint a Jira / server agent token for any org (platform admin). Plaintext returned once. */
  fastify.post(
    '/orgs/:orgId/agent-token',
    {
      preHandler: [authenticate, requirePlatformAdmin()],
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const { orgId } = request.params as { orgId: string }
      const parsed = platformAgentTokenBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      })
      if (!org) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Organization not found' })
      }

      const raw = `${randomUUID()}${randomUUID().replace(/-/g, '')}`
      const token_hash = hashRefreshToken(raw)

      await prisma.agentToken.create({
        data: {
          org_id: orgId,
          token_hash,
          name: parsed.data.name ?? null,
        },
      })

      await logAuditEvent({
        orgId,
        actorId: req.user!.id,
        action: 'platform.agent_token_created',
        targetType: 'organization',
        targetId: orgId,
        newValue: { organization_name: org.name },
        ip: request.ip,
      })

      return reply.status(201).send({
        token: raw,
        message: 'Store this token securely; it will not be shown again.',
        organization_id: org.id,
        organization_name: org.name,
      })
    }
  )
}
