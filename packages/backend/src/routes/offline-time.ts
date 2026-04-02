import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { createAuthenticateMiddleware } from '../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../middleware/authenticate.js'
import type { Config } from '../config.js'
import { canAccessOrgUser, mayActAsPeopleManager } from '../lib/permissions.js'

const listQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

const createBodySchema = z.object({
  user_id: z.string().uuid(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  description: z.string().min(1).max(2000),
})

async function employeeMayAddOwnOffline(orgId: string, userId: string): Promise<boolean> {
  const [row, settings] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, org_id: orgId },
      select: { can_add_offline_time: true },
    }),
    prisma.orgSettings.findUnique({
      where: { org_id: orgId },
      select: { allow_employee_offline_time: true },
    }),
  ])
  if (!row) return false
  if (row.can_add_offline_time === true) return true
  if (row.can_add_offline_time === false) return false
  return settings?.allow_employee_offline_time === true
}

export async function offlineTimeRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const q = parsed.data

      if (q.user_id && q.user_id !== caller.id && !mayActAsPeopleManager(caller.role)) {
        return reply
          .status(403)
          .send({ code: 'FORBIDDEN', message: 'Cannot list offline time for others' })
      }

      const targetUserId = q.user_id && mayActAsPeopleManager(caller.role) ? q.user_id : caller.id

      if (q.user_id && q.user_id !== caller.id) {
        if (!(await canAccessOrgUser(caller, q.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
      }

      const target = await prisma.user.findFirst({
        where: { id: targetUserId, org_id: caller.org_id },
        select: { id: true },
      })
      if (!target) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const fromD = q.from ? new Date(q.from) : undefined
      const toD = q.to ? new Date(q.to) : undefined

      const where = {
        org_id: caller.org_id,
        user_id: targetUserId,
        ...(fromD || toD
          ? {
              AND: [
                ...(fromD ? [{ end_time: { gt: fromD } as const }] : []),
                ...(toD ? [{ start_time: { lt: toD } as const }] : []),
              ],
            }
          : {}),
      }

      const entries = await prisma.offlineTime.findMany({
        where,
        orderBy: { start_time: 'asc' },
        select: {
          id: true,
          user_id: true,
          added_by_id: true,
          start_time: true,
          end_time: true,
          description: true,
          created_at: true,
        },
      })

      return { offline_time: entries }
    },
  })

  fastify.post('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      const body = createBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const { user_id: subjectId, start_time, end_time, description } = body.data
      const start = new Date(start_time)
      const end = new Date(end_time)
      if (end <= start) {
        return reply
          .status(400)
          .send({ code: 'INVALID_RANGE', message: 'end_time must be after start_time' })
      }

      const subject = await prisma.user.findFirst({
        where: { id: subjectId, org_id: caller.org_id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!subject) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      if (mayActAsPeopleManager(caller.role)) {
        if (!(await canAccessOrgUser(caller, subjectId))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
      } else if (caller.id === subjectId) {
        const ok = await employeeMayAddOwnOffline(caller.org_id, caller.id)
        if (!ok) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'You do not have permission to add offline time',
          })
        }
      } else {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const row = await prisma.offlineTime.create({
        data: {
          org_id: caller.org_id,
          user_id: subjectId,
          added_by_id: caller.id,
          start_time: start,
          end_time: end,
          description,
        },
        select: {
          id: true,
          user_id: true,
          added_by_id: true,
          start_time: true,
          end_time: true,
          description: true,
          created_at: true,
        },
      })

      return reply.status(201).send({ offline_time: row })
    },
  })

  fastify.delete('/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params as { id: string }

      const row = await prisma.offlineTime.findFirst({
        where: { id, org_id: caller.org_id },
      })
      if (!row) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found' })
      }

      if (mayActAsPeopleManager(caller.role)) {
        if (!(await canAccessOrgUser(caller, row.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        await prisma.offlineTime.delete({ where: { id } })
        return { deleted: true }
      }

      if (row.user_id !== caller.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const ok = await employeeMayAddOwnOffline(caller.org_id, caller.id)
      if (!ok) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      await prisma.offlineTime.delete({ where: { id } })
      return { deleted: true }
    },
  })
}
