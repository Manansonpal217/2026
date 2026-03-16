import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function integrationDeleteRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.delete('/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const integration = await prisma.integration.findFirst({
        where: { id, org_id: req.user!.org_id },
      })

      if (!integration) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Integration not found' })
      }

      // Shred auth_data (zero-fill the buffer)
      const zeroedAuthData = Buffer.alloc(integration.auth_data.length, 0)

      await prisma.$transaction([
        // Shred tokens
        prisma.integration.update({
          where: { id },
          data: {
            auth_data: zeroedAuthData,
            status: 'disconnected',
          },
        }),
        // Soft-delete projects that came from this integration
        prisma.project.updateMany({
          where: {
            org_id: req.user!.org_id,
            id: { startsWith: `ext-${integration.type}-` },
          },
          data: { archived: true },
        }),
      ])

      return reply.status(204).send()
    },
  })
}
