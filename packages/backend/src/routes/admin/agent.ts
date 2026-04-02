import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import type { Prisma } from '@prisma/client'
import { hashRefreshToken } from '../../lib/password.js'
import { canAccessOrgUser, hasPermission, Permission } from '../../lib/permissions.js'

const createTokenBodySchema = z.object({
  name: z.string().max(100).optional(),
})

const listCommandsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const patchAgentConfigSchema = z.object({
  jira_projects: z.array(z.unknown()).optional(),
  jira_issue_types: z.array(z.unknown()).optional(),
  jira_statuses: z.array(z.unknown()).optional(),
  jira_time_logging_method: z.string().max(64).optional(),
})

const enqueueCommandBodySchema = z.object({
  user_id: z.string().uuid(),
  type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export async function adminAgentRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.post(
    '/agent/token',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    },
    async (request, reply) => {
      const req = request as AuthenticatedRequest
      const body = createTokenBodySchema.safeParse(request.body ?? {})
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const raw = `${randomUUID()}${randomUUID().replace(/-/g, '')}`
      const token_hash = hashRefreshToken(raw)

      await prisma.agentToken.create({
        data: {
          org_id: req.user!.org_id,
          token_hash,
          name: body.data.name ?? null,
        },
      })

      return reply.status(201).send({
        token: raw,
        message: 'Store this token securely; it will not be shown again.',
      })
    }
  )

  fastify.delete(
    '/agent/token',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    },
    async (request, reply) => {
      const req = request as AuthenticatedRequest
      await prisma.agentToken.deleteMany({ where: { org_id: req.user!.org_id } })
      return reply.status(204).send()
    }
  )

  fastify.get(
    '/agent/status',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    },
    async (request) => {
      const req = request as AuthenticatedRequest
      const orgId = req.user!.org_id

      const [heartbeat, tokenCount, tokens] = await Promise.all([
        prisma.agentHeartbeat.findUnique({ where: { org_id: orgId } }),
        prisma.agentToken.count({ where: { org_id: orgId } }),
        prisma.agentToken.findMany({
          where: { org_id: orgId },
          select: { id: true, name: true, last_seen_at: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: 5,
        }),
      ])

      return {
        heartbeat,
        token_count: tokenCount,
        tokens_preview: tokens,
      }
    }
  )

  fastify.get(
    '/agent/commands',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    },
    async (request, reply) => {
      const req = request as AuthenticatedRequest
      const parsed = listCommandsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { page, limit } = parsed.data

      const where = { org_id: req.user!.org_id }
      const [commands, total] = await Promise.all([
        prisma.agentCommand.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            user_id: true,
            type: true,
            status: true,
            attempts: true,
            error: true,
            locked_at: true,
            completed_at: true,
            created_at: true,
            updated_at: true,
          },
        }),
        prisma.agentCommand.count({ where }),
      ])

      return { commands, total, page, limit }
    }
  )

  fastify.patch(
    '/agent/config',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    },
    async (request, reply) => {
      const req = request as AuthenticatedRequest
      if (!hasPermission(req.user!, Permission.SETTINGS_MANAGE_ADVANCED)) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Insufficient permissions' })
      }

      const body = patchAgentConfigSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const data: Prisma.OrgSettingsUpdateInput = {}
      if (body.data.jira_projects !== undefined) {
        data.jira_projects = body.data.jira_projects as Prisma.InputJsonValue
      }
      if (body.data.jira_issue_types !== undefined) {
        data.jira_issue_types = body.data.jira_issue_types as Prisma.InputJsonValue
      }
      if (body.data.jira_statuses !== undefined) {
        data.jira_statuses = body.data.jira_statuses as Prisma.InputJsonValue
      }
      if (body.data.jira_time_logging_method !== undefined) {
        data.jira_time_logging_method = body.data.jira_time_logging_method
      }

      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'No fields to update' })
      }

      const createData: Prisma.OrgSettingsUncheckedCreateInput = {
        org_id: req.user!.org_id,
      }
      if (body.data.jira_projects !== undefined) {
        createData.jira_projects = body.data.jira_projects as Prisma.InputJsonValue
      }
      if (body.data.jira_issue_types !== undefined) {
        createData.jira_issue_types = body.data.jira_issue_types as Prisma.InputJsonValue
      }
      if (body.data.jira_statuses !== undefined) {
        createData.jira_statuses = body.data.jira_statuses as Prisma.InputJsonValue
      }
      if (body.data.jira_time_logging_method !== undefined) {
        createData.jira_time_logging_method = body.data.jira_time_logging_method
      }

      const updated = await prisma.orgSettings.upsert({
        where: { org_id: req.user!.org_id },
        create: createData,
        update: data,
      })

      return { settings: updated }
    }
  )

  fastify.post(
    '/agent/commands',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    },
    async (request, reply) => {
      const req = request as AuthenticatedRequest
      const body = enqueueCommandBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const subject = await prisma.user.findFirst({
        where: { id: body.data.user_id, org_id: req.user!.org_id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!subject) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      if (!(await canAccessOrgUser(req.user!, body.data.user_id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const cmd = await prisma.agentCommand.create({
        data: {
          org_id: req.user!.org_id,
          user_id: body.data.user_id,
          type: body.data.type,
          payload: (body.data.payload ?? {}) as Prisma.InputJsonValue,
        },
      })

      return reply.status(201).send({ command: cmd })
    }
  )
}
