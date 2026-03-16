import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { logAuditEvent } from '../../lib/audit.js'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['active', 'suspended', 'invited']).optional(),
  role: z.string().optional(),
  search: z.string().optional(),
})

const patchUserSchema = z.object({
  role: z.enum(['employee', 'manager', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  name: z.string().min(1).max(100).optional(),
})

export async function adminUserRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/users', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) return { users: [], total: 0 }
      const query = parsed.data

      const where = {
        org_id: req.user!.org_id,
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
          select: { id: true, name: true, email: true, role: true, status: true, created_at: true, mfa_enabled: true },
          orderBy: { created_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.user.count({ where }),
      ])

      return { users, total, page: query.page, limit: query.limit }
    },
  })

  fastify.patch('/users/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const body = patchUserSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const target = await prisma.user.findFirst({ where: { id, org_id: req.user!.org_id } })
      if (!target) return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })

      // Guards
      if (target.role === 'super_admin') {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot modify super_admin' })
      }
      if (id === req.user!.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot modify yourself' })
      }

      const oldValue = { role: target.role, status: target.status, name: target.name }
      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(body.data.role && { role: body.data.role }),
          ...(body.data.status && { status: body.data.status }),
          ...(body.data.name && { name: body.data.name }),
        },
        select: { id: true, name: true, email: true, role: true, status: true },
      })

      await logAuditEvent({
        orgId: req.user!.org_id,
        actorId: req.user!.id,
        action: 'user.updated',
        targetType: 'user',
        targetId: id,
        oldValue,
        newValue: body.data,
        ip: request.ip,
      })

      return { user: updated }
    },
  })

  fastify.delete('/users/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const { id } = request.params as { id: string }

      const target = await prisma.user.findFirst({ where: { id, org_id: req.user!.org_id } })
      if (!target) return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })

      if (target.role === 'super_admin') {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot suspend super_admin' })
      }

      await prisma.user.update({ where: { id }, data: { status: 'suspended' } })

      await logAuditEvent({
        orgId: req.user!.org_id,
        actorId: req.user!.id,
        action: 'user.suspended',
        targetType: 'user',
        targetId: id,
        ip: request.ip,
      })

      return reply.status(204).send()
    },
  })
}
