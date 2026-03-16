import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  budget_hours: z.number().positive().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  archived: z.boolean().optional(),
  budget_hours: z.number().positive().nullable().optional(),
})

export async function projectRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  // POST /v1/projects — create a project (admin+)
  fastify.post('/', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const body = createProjectSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const project = await prisma.project.create({
        data: {
          org_id: req.user!.org_id,
          name: body.data.name,
          color: body.data.color ?? '#6366f1',
          budget_hours: body.data.budget_hours ?? null,
        },
      })

      return reply.status(201).send({ project })
    },
  })

  // GET /v1/projects — list projects
  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const query = request.query as { page?: string; limit?: string; archived?: string }
      const page = Math.max(1, parseInt(query.page ?? '1'))
      const limit = Math.min(100, parseInt(query.limit ?? '50'))
      const archived = query.archived === 'true'

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where: { org_id: req.user!.org_id, archived },
          orderBy: { name: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            name: true,
            color: true,
            archived: true,
            budget_hours: true,
            created_at: true,
            _count: { select: { tasks: true } },
          },
        }),
        prisma.project.count({ where: { org_id: req.user!.org_id, archived } }),
      ])

      return { projects, total, page, limit }
    },
  })

  // GET /v1/projects/:id — get single project
  fastify.get('/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const project = await prisma.project.findFirst({
        where: { id, org_id: req.user!.org_id },
        include: {
          tasks: { where: { status: { not: 'closed' } }, orderBy: { name: 'asc' } },
        },
      })

      if (!project) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Project not found' })
      }

      return { project }
    },
  })

  // PATCH /v1/projects/:id — update project (admin+)
  fastify.patch('/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }
      const body = updateProjectSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const existing = await prisma.project.findFirst({ where: { id, org_id: req.user!.org_id } })
      if (!existing) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Project not found' })
      }

      const project = await prisma.project.update({
        where: { id },
        data: {
          ...(body.data.name !== undefined && { name: body.data.name }),
          ...(body.data.color !== undefined && { color: body.data.color }),
          ...(body.data.archived !== undefined && { archived: body.data.archived }),
          ...(body.data.budget_hours !== undefined && { budget_hours: body.data.budget_hours }),
        },
      })

      return { project }
    },
  })

  // DELETE /v1/projects/:id — soft delete (archive)
  fastify.delete('/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const existing = await prisma.project.findFirst({ where: { id, org_id: req.user!.org_id } })
      if (!existing) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Project not found' })
      }

      await prisma.project.update({ where: { id }, data: { archived: true } })
      return reply.status(204).send()
    },
  })
}
