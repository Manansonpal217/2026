import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { canAccessOrgUser, mayActAsPeopleManager } from '../../lib/permissions.js'

const updateSessionSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  task_id: z.string().uuid().nullable().optional(),
})

export async function sessionUpdateRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.patch('/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }
      const body = updateSessionSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const session = await prisma.timeSession.findFirst({
        where: { id, org_id: user.org_id },
      })

      if (!session) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' })
      }

      if (session.user_id !== user.id) {
        if (!mayActAsPeopleManager(user.role)) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        if (!(await canAccessOrgUser(user, session.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
      }

      // Validate project_id and task_id belong to org
      if (body.data.project_id) {
        const project = await prisma.project.findFirst({
          where: { id: body.data.project_id, org_id: user.org_id },
        })
        if (!project) {
          return reply
            .status(400)
            .send({ code: 'INVALID_PROJECT', message: 'Project not found in your organization' })
        }
      }

      if (body.data.task_id) {
        const task = await prisma.task.findFirst({
          where: { id: body.data.task_id, org_id: user.org_id },
        })
        if (!task) {
          return reply
            .status(400)
            .send({ code: 'INVALID_TASK', message: 'Task not found in your organization' })
        }
      }

      const updated = await prisma.timeSession.update({
        where: { id },
        data: {
          ...(body.data.notes !== undefined && { notes: body.data.notes }),
          ...(body.data.project_id !== undefined && { project_id: body.data.project_id }),
          ...(body.data.task_id !== undefined && { task_id: body.data.task_id }),
        },
        include: {
          project: { select: { id: true, name: true, color: true } },
          task: { select: { id: true, name: true } },
        },
      })

      return { session: updated }
    },
  })
}
