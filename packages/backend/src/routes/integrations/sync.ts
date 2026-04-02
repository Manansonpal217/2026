import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function integrationSyncRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.post('/:id/sync', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const integration = await prisma.integration.findFirst({
        where: { id, org_id: req.user!.org_id, status: { not: 'disconnected' } },
      })

      if (!integration) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Integration not found' })
      }

      const { getIntegrationQueue } = await import('../../queues/index.js')
      const queue = getIntegrationQueue()

      // Deduplicated job — clicking sync twice doesn't create two workers
      const job = await queue.add(
        'sync',
        { integrationId: id, orgId: req.user!.org_id },
        { jobId: `integrationSync:${id}`, attempts: 3 }
      )

      return { queued: true, job_id: job.id }
    },
  })
}
