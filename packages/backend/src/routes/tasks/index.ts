import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const createTaskSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
  external_id: z.string().optional(),
})

const updateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
})

export async function taskRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  // GET /v1/projects/tasks/search — search tasks across all projects (must be before :projectId route)
  fastify.get('/tasks/search', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const query = request.query as { q?: string; assigneeFilter?: string }
      const q = (query.q ?? '').trim()
      if (q.length < 2) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Query must be at least 2 characters' })
      }
      const assigneeFilter = query.assigneeFilter === 'me' ? 'me' : 'all'

      const tasks = await prisma.task.findMany({
        where: {
          org_id: req.user!.org_id,
          status: { in: ['open', 'in_progress'] },
          ...(assigneeFilter === 'me' ? { assignee_user_id: req.user!.id } : {}),
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { external_id: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { project: { select: { id: true, name: true, color: true } } },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        take: 15,
      })

      return { tasks }
    },
  })

  // POST /v1/projects/:projectId/tasks
  fastify.post('/:projectId/tasks', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { projectId } = request.params as { projectId: string }
      const body = createTaskSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      // Verify project belongs to org
      const project = await prisma.project.findFirst({
        where: { id: projectId, org_id: req.user!.org_id, archived: false },
      })
      if (!project) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Project not found' })
      }

      const task = await prisma.task.create({
        data: {
          project_id: projectId,
          org_id: req.user!.org_id,
          name: body.data.name,
          status: body.data.status ?? 'open',
          external_id: body.data.external_id ?? null,
        },
      })

      return reply.status(201).send({ task })
    },
  })

  // GET /v1/projects/:projectId/tasks
  fastify.get('/:projectId/tasks', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { status?: string; assigneeFilter?: string }

      // Verify project belongs to org
      const project = await prisma.project.findFirst({
        where: { id: projectId, org_id: req.user!.org_id },
      })
      if (!project) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Project not found' })
      }

      const assigneeFilter = query.assigneeFilter === 'me' ? 'me' : 'all'

      const tasks = await prisma.task.findMany({
        where: {
          project_id: projectId,
          org_id: req.user!.org_id,
          ...(query.status && ['open', 'in_progress', 'closed'].includes(query.status)
            ? { status: query.status }
            : {}),
          ...(assigneeFilter === 'me' ? { assignee_user_id: req.user!.id } : {}),
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      })

      return { tasks }
    },
  })

  // PATCH /v1/tasks/:id
  fastify.patch('/tasks/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }
      const body = updateTaskSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const existing = await prisma.task.findFirst({
        where: { id, org_id: req.user!.org_id },
      })
      if (!existing) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Task not found' })
      }

      // Only admin+ can close tasks; any member can change open <-> in_progress
      if (body.data.status === 'closed') {
        const role = req.user!.role
        if (!['admin', 'super_admin', 'manager'].includes(role)) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Only managers+ can close tasks' })
        }
      }

      const task = await prisma.task.update({
        where: { id },
        data: {
          ...(body.data.name !== undefined && { name: body.data.name }),
          ...(body.data.status !== undefined && { status: body.data.status }),
        },
      })

      return { task }
    },
  })
}
