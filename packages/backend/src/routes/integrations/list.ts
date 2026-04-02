import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requirePermission } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { Permission } from '../../lib/permissions.js'

export async function integrationListRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/', {
    preHandler: [authenticate, requirePermission(Permission.INTEGRATIONS_VIEW)],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const integrations = await prisma.integration.findMany({
        where: { org_id: req.user!.org_id, status: { not: 'disconnected' } },
        select: {
          id: true,
          type: true,
          name: true,
          status: true,
          last_sync_at: true,
          created_at: true,
          config: true,
        },
        orderBy: { created_at: 'desc' },
      })
      return { integrations }
    },
  })

  fastify.get('/:id', {
    preHandler: [authenticate, requirePermission(Permission.INTEGRATIONS_VIEW)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const integration = await prisma.integration.findFirst({
        where: { id, org_id: req.user!.org_id },
        select: {
          id: true,
          type: true,
          name: true,
          status: true,
          last_sync_at: true,
          created_at: true,
          config: true,
        },
      })

      if (!integration) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Integration not found' })
      }

      // Count synced projects + tasks by external_id prefix
      const [projectCount, taskCount] = await Promise.all([
        prisma.project.count({
          where: { org_id: req.user!.org_id, id: { startsWith: `ext-${integration.type}-` } },
        }),
        prisma.task.count({
          where: { org_id: req.user!.org_id, external_id: { startsWith: `${integration.type}:` } },
        }),
      ])

      return { integration, stats: { projects: projectCount, tasks: taskCount } }
    },
  })
}
