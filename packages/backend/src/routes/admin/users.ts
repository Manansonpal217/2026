import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import {
  createAuthenticateMiddleware,
  requirePermission,
  requireRole,
} from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { logAuditEvent } from '../../lib/audit.js'
import { getRedis } from '../../db/redis.js'
import {
  canAccessOrgUser,
  getValidManagerAssignee,
  hasPermission,
  isOwnerRole,
  Permission,
  userWhereVisibleToOrgPeers,
  wouldCreateManagerCycle,
} from '../../lib/permissions.js'

const USER_STATUS_PREFIX = 'user:status:v2:'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  role: z.string().optional(),
  search: z.string().optional(),
  /** Users whose `manager_id` equals this id (direct reports of that manager). */
  manager_id: z.string().uuid().optional(),
})

const patchUserSchema = z.object({
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  name: z.string().min(1).max(100).optional(),
})

export async function adminUserRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)
  const redis = getRedis(opts.config)

  fastify.get('/users', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER', 'MANAGER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const u = req.user!
      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) return { users: [], total: 0 }
      const query = parsed.data

      const andClauses: object[] = []
      if (u.role === 'MANAGER') {
        andClauses.push({ OR: [{ id: u.id }, { manager_id: u.id }] })
      }
      if (query.status) andClauses.push({ status: query.status })
      if (query.role) andClauses.push({ role: query.role })
      if (query.search) {
        andClauses.push({
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        })
      }
      if (query.manager_id) {
        andClauses.push({ manager_id: query.manager_id })
      }

      const where = {
        org_id: u.org_id,
        AND: [...(andClauses.length > 0 ? andClauses : []), userWhereVisibleToOrgPeers(u)],
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            created_at: true,
            manager_id: true,
            can_add_offline_time: true,
            manager: { select: { id: true, name: true, email: true } },
          },
          orderBy: { created_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.user.count({ where }),
      ])

      return { users, total, page: query.page, limit: query.limit }
    },
  })

  const directReportsBodySchema = z.object({
    user_ids: z.array(z.string().uuid()).max(500),
  })

  fastify.put('/users/:managerId/direct-reports', {
    preHandler: [authenticate, requirePermission(Permission.USERS_ASSIGN_MANAGER)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { managerId } = request.params as { managerId: string }

      const body = directReportsBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const selectedUnique = [...new Set(body.data.user_ids)].filter((id) => id !== managerId)

      const managerRow = await prisma.user.findFirst({
        where: { id: managerId, org_id: caller.org_id },
        select: { id: true, role: true, status: true },
      })
      if (!managerRow) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Manager user not found' })
      }

      if (!(await canAccessOrgUser(caller, managerId))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const validMgr = await getValidManagerAssignee(caller.org_id, managerId, caller.role)
      if (!validMgr.ok) {
        return reply.status(400).send({ code: validMgr.code, message: validMgr.message })
      }

      if ((managerRow.status as string) !== 'ACTIVE') {
        return reply
          .status(400)
          .send({ code: 'INVALID_MANAGER', message: 'Manager must be an active user' })
      }

      for (const reportId of selectedUnique) {
        const subject = await prisma.user.findFirst({
          where: { id: reportId, org_id: caller.org_id },
          select: { id: true, role: true },
        })
        if (!subject) {
          return reply
            .status(400)
            .send({ code: 'NOT_FOUND', message: `User not found: ${reportId}` })
        }
        if (isOwnerRole(subject.role as string) && !isOwnerRole(caller.role)) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        if (!(await canAccessOrgUser(caller, reportId))) {
          return reply
            .status(403)
            .send({ code: 'FORBIDDEN', message: 'Access denied for one or more users' })
        }
        if (await wouldCreateManagerCycle(reportId, managerId, caller.org_id)) {
          return reply.status(400).send({
            code: 'MANAGER_CYCLE',
            message: 'Assignment would create a manager hierarchy cycle',
          })
        }
      }

      const before = await prisma.user.findMany({
        where: { org_id: caller.org_id, manager_id: managerId },
        select: { id: true },
      })
      const beforeIds = before.map((r) => r.id).sort()

      await prisma.$transaction(async (tx) => {
        await tx.user.updateMany({
          where: { org_id: caller.org_id, manager_id: managerId },
          data: { manager_id: null },
        })
        for (const uid of selectedUnique) {
          await tx.user.update({
            where: { id: uid, org_id: caller.org_id },
            data: { manager_id: managerId },
          })
        }
      })

      const after = await prisma.user.findMany({
        where: { org_id: caller.org_id, manager_id: managerId },
        select: { id: true },
      })
      const afterIds = after.map((r) => r.id).sort()

      await logAuditEvent({
        orgId: caller.org_id,
        actorId: caller.id,
        action: 'user.direct_reports_synced',
        targetType: 'user',
        targetId: managerId,
        oldValue: { user_ids: beforeIds },
        newValue: { user_ids: afterIds },
        ip: request.ip,
      })

      return { user_ids: afterIds }
    },
  })

  fastify.patch('/users/:id', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER', 'MANAGER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params as { id: string }

      const body = patchUserSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const hasAnyField =
        body.data.role !== undefined ||
        body.data.status !== undefined ||
        body.data.name !== undefined
      if (!hasAnyField) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'No fields to update' })
      }

      const target = await prisma.user.findFirst({ where: { id, org_id: caller.org_id } })
      if (!target) return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })

      if (isOwnerRole(target.role as string)) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot modify the org OWNER' })
      }
      if (id === caller.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot modify yourself' })
      }

      if (!(await canAccessOrgUser(caller, id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const wantsRoleChange =
        body.data.role !== undefined && body.data.role !== (target.role as string)
      const wantsStatusChange =
        body.data.status !== undefined && body.data.status !== (target.status as string)

      if (wantsStatusChange) {
        if (!hasPermission(caller, Permission.USERS_SUSPEND)) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot change user status' })
        }
      }

      if (wantsRoleChange) {
        const r = body.data.role!
        if (r === 'MANAGER' && !hasPermission(caller, Permission.USERS_ROLE_SET_MANAGER)) {
          return reply
            .status(403)
            .send({ code: 'FORBIDDEN', message: 'Cannot assign manager role' })
        }
        if (r === 'ADMIN' && !hasPermission(caller, Permission.USERS_ROLE_SET_ADMIN)) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot assign admin role' })
        }
        if (r === 'EMPLOYEE') {
          const adminLike = caller.role === 'OWNER' || caller.role === 'ADMIN'
          const managerDemoteReport =
            caller.role === 'MANAGER' &&
            target.manager_id === caller.id &&
            (target.role as string) === 'MANAGER'
          if (!adminLike && !managerDemoteReport) {
            return reply
              .status(403)
              .send({ code: 'FORBIDDEN', message: 'Cannot change role to EMPLOYEE' })
          }
        }
      }

      const oldValue = { role: target.role, status: target.status, name: target.name }

      // Build update payload; increment role_version if role is changing
      const updateData: Record<string, unknown> = {}
      if (body.data.role) updateData.role = body.data.role
      if (body.data.status) updateData.status = body.data.status
      if (body.data.name) updateData.name = body.data.name
      if (wantsRoleChange) updateData.role_version = { increment: 1 }

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, email: true, role: true, status: true, role_version: true },
      })

      // Evict status cache so next request re-fetches the new role_version
      if (wantsRoleChange || wantsStatusChange) {
        redis.del(`${USER_STATUS_PREFIX}${id}`).catch(() => {})
      }

      await logAuditEvent({
        orgId: caller.org_id,
        actorId: caller.id,
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
    preHandler: [authenticate, requirePermission(Permission.USERS_SUSPEND)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params as { id: string }

      const target = await prisma.user.findFirst({ where: { id, org_id: caller.org_id } })
      if (!target) return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })

      if (isOwnerRole(target.role as string)) {
        return reply
          .status(403)
          .send({ code: 'FORBIDDEN', message: 'Cannot suspend the org OWNER' })
      }

      if (id === caller.id) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Cannot suspend yourself' })
      }

      if (!(await canAccessOrgUser(caller, id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } })

      // Evict cache so the suspended user is blocked on next request
      redis.del(`${USER_STATUS_PREFIX}${id}`).catch(() => {})

      await logAuditEvent({
        orgId: caller.org_id,
        actorId: caller.id,
        action: 'user.suspended',
        targetType: 'user',
        targetId: id,
        ip: request.ip,
      })

      return reply.status(204).send()
    },
  })
}
