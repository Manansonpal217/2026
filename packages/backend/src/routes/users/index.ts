import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import {
  createAuthenticateMiddleware,
  requireRole,
  requirePermission,
} from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import {
  canAccessOrgUser,
  getValidManagerAssignee,
  hasPermission,
  Permission,
  userWhereVisibleToOrgPeers,
} from '../../lib/permissions.js'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

export async function userRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  // GET /v1/users — list org members (admin+ only)
  fastify.get('/', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const andClauses: object[] = []
      if (user.role === 'MANAGER') {
        andClauses.push({ OR: [{ id: user.id }, { manager_id: user.id }] })
      }
      if (query.role) andClauses.push({ role: query.role })
      if (query.status) andClauses.push({ status: query.status })
      if (query.search) {
        andClauses.push({
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        })
      }
      const where = {
        org_id: user.org_id,
        AND: [...(andClauses.length > 0 ? andClauses : []), userWhereVisibleToOrgPeers(user)],
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
            manager_id: true,
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

      if (caller.id !== id && !(await canAccessOrgUser(caller, id))) {
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
          can_add_offline_time: true,
          manager_id: true,
          manager: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      if (!user) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const orgSettings = await prisma.orgSettings.findUnique({
        where: { org_id: caller.org_id },
        select: {
          expected_daily_work_minutes: true,
          allow_employee_offline_time: true,
        },
      })

      const now = new Date()
      const [latestShot, recentSessions, openSession] = await Promise.all([
        prisma.screenshot.findFirst({
          where: { user_id: id, org_id: caller.org_id, deleted_at: null },
          orderBy: { taken_at: 'desc' },
          select: { taken_at: true },
        }),
        prisma.timeSession.findMany({
          where: { user_id: id, org_id: caller.org_id },
          select: { started_at: true, ended_at: true },
          orderBy: { updated_at: 'desc' },
          take: 800,
        }),
        prisma.timeSession.findFirst({
          where: { user_id: id, org_id: caller.org_id, ended_at: null },
          select: { id: true },
        }),
      ])

      let lastMs = 0
      for (const s of recentSessions) {
        const t = Math.max(s.started_at.getTime(), (s.ended_at ?? now).getTime())
        if (t > lastMs) lastMs = t
      }
      if (latestShot) lastMs = Math.max(lastMs, latestShot.taken_at.getTime())
      const last_active = lastMs > 0 ? new Date(lastMs).toISOString() : null

      return {
        user: {
          ...user,
          last_active,
          is_tracking: Boolean(openSession),
        },
        expected_daily_work_minutes: orgSettings?.expected_daily_work_minutes ?? 480,
        allow_employee_offline_time: orgSettings?.allow_employee_offline_time ?? false,
      }
    },
  })

  const patchUserPermissionsSchema = z.object({
    can_add_offline_time: z.boolean().nullable(),
  })

  fastify.patch<{ Params: { id: string } }>('/:id/permissions', {
    preHandler: [authenticate, requireRole('OWNER', 'ADMIN', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params

      const body = patchUserPermissionsSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      if (!hasPermission(caller, Permission.OFFLINE_TIME_MANAGE_USER)) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const target = await prisma.user.findFirst({
        where: { id, org_id: caller.org_id },
        select: { id: true, role: true },
      })
      if (!target) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      if (target.role === 'OWNER' && caller.role !== 'OWNER') {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      if (!(await canAccessOrgUser(caller, id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { can_add_offline_time: body.data.can_add_offline_time },
        select: {
          id: true,
          can_add_offline_time: true,
        },
      })

      return { user: updated }
    },
  })

  const patchManagerSchema = z.object({
    manager_id: z.string().uuid().nullable(),
  })

  fastify.patch<{ Params: { id: string } }>('/:id/manager', {
    preHandler: [authenticate, requirePermission(Permission.USERS_ASSIGN_MANAGER)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params

      const body = patchManagerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const { manager_id } = body.data
      if (manager_id === id) {
        return reply
          .status(400)
          .send({ code: 'INVALID_MANAGER', message: 'User cannot be their own manager' })
      }

      const target = await prisma.user.findFirst({
        where: { id, org_id: caller.org_id },
        select: { id: true, role: true },
      })
      if (!target) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      if (target.role === 'OWNER' && caller.role !== 'OWNER') {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      if (!(await canAccessOrgUser(caller, id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const validMgr = await getValidManagerAssignee(caller.org_id, manager_id, caller.role)
      if (!validMgr.ok) {
        return reply
          .status(manager_id ? 400 : 400)
          .send({ code: validMgr.code, message: validMgr.message })
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { manager_id },
        select: {
          id: true,
          manager_id: true,
          manager: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      return { user: updated }
    },
  })
}
