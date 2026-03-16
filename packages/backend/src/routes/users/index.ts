import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  role: z.enum(['super_admin', 'admin', 'manager', 'employee']).optional(),
  status: z.enum(['active', 'inactive', 'invited']).optional(),
})

export async function userRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  // GET /v1/users — list org members (admin+ only)
  fastify.get('/', {
    preHandler: [authenticate, requireRole('super_admin', 'admin', 'manager')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const where = {
        org_id: user.org_id,
        ...(query.role && { role: query.role }),
        ...(query.status && { status: query.status }),
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
          orderBy: [{ role: 'asc' }, { name: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            created_at: true,
          },
        }),
        prisma.user.count({ where }),
      ])

      return { users, total, page: query.page, limit: query.limit }
    },
  })

  // GET /v1/users/:id — get single user (admin+ or self)
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params

      const canViewOthers = ['super_admin', 'admin', 'manager'].includes(caller.role)
      if (!canViewOthers && caller.id !== id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const user = await prisma.user.findFirst({
        where: { id, org_id: caller.org_id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          created_at: true,
        },
      })

      if (!user) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      return { user }
    },
  })
}
