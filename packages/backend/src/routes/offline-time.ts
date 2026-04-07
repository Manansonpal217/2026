import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../middleware/authenticate.js'
import type { Config } from '../config.js'
import { canAccessOrgUser, mayActAsPeopleManager } from '../lib/permissions.js'
import { sendSSE } from '../lib/sse.js'
import { enqueueTransactionalEmail } from '../services/email/enqueue.js'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const PAGE_SIZE = 20

const offlineTimeSelect = {
  id: true,
  org_id: true,
  user_id: true,
  requested_by_id: true,
  approver_id: true,
  source: true,
  status: true,
  start_time: true,
  end_time: true,
  description: true,
  approver_note: true,
  expires_at: true,
  created_at: true,
} as const

const requestBodySchema = z.object({
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  description: z.string().min(1).max(500),
})

const directAddBodySchema = z.object({
  user_id: z.string().uuid(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  description: z.string().min(1).max(500),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  user_id: z.string().uuid().optional(),
})

const approveBodySchema = z.object({
  note: z.string().max(2000).optional(),
})

const rejectBodySchema = z.object({
  approver_note: z.string().min(1).max(2000),
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

async function findManagersForUser(orgId: string, userId: string): Promise<string[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { user_id: userId, team: { org_id: orgId } },
    select: { team: { select: { manager_id: true } } },
  })
  const ids = new Set<string>()
  for (const m of memberships) {
    if (m.team.manager_id) ids.add(m.team.manager_id)
  }
  ids.delete(userId)
  return [...ids]
}

async function hasApprovedOverlap(
  orgId: string,
  userId: string,
  start: Date,
  end: Date,
  excludeId?: string
): Promise<boolean> {
  const overlap = await prisma.offlineTime.findFirst({
    where: {
      org_id: orgId,
      user_id: userId,
      status: 'APPROVED',
      end_time: { gt: start },
      start_time: { lt: end },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  return !!overlap
}

function buildNotificationPayload(row: {
  id: string
  start_time: Date
  end_time: Date
  description: string
  user_id?: string
}) {
  return {
    offline_time_id: row.id,
    start_time: row.start_time.toISOString(),
    end_time: row.end_time.toISOString(),
    description: row.description,
    user_id: row.user_id,
  }
}

export async function offlineTimeRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  // ── POST /request ─────────────────────────────────────────────────────────────
  fastify.post('/request', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      const body = requestBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const start = new Date(body.data.start_time)
      const end = new Date(body.data.end_time)
      if (end <= start) {
        return reply
          .status(400)
          .send({ code: 'INVALID_RANGE', message: 'end_time must be after start_time' })
      }
      if (end.getTime() > Date.now()) {
        return reply
          .status(422)
          .send({ code: 'FUTURE_TIME', message: 'end_time cannot be in the future' })
      }
      const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS)
      if (start < thirtyDaysAgo) {
        return reply
          .status(422)
          .send({ code: 'TOO_OLD', message: 'start_time cannot be more than 30 days ago' })
      }

      if (!mayActAsPeopleManager(caller.role)) {
        const ok = await employeeMayAddOwnOffline(caller.org_id, caller.id)
        if (!ok) {
          return reply
            .status(403)
            .send({ code: 'FORBIDDEN', message: 'You do not have permission to add offline time' })
        }
      }

      if (await hasApprovedOverlap(caller.org_id, caller.id, start, end)) {
        return reply
          .status(409)
          .send({ code: 'OVERLAP', message: 'Overlaps an existing approved entry' })
      }

      const isAdminOrOwner = caller.role === 'ADMIN' || caller.role === 'OWNER'
      /** Managers use the same per-user / org rules as employees for self-service; then no approval queue. */
      const managerMaySelfApproveOffline =
        caller.role === 'MANAGER' && (await employeeMayAddOwnOffline(caller.org_id, caller.id))

      if (isAdminOrOwner || managerMaySelfApproveOffline) {
        const row = await prisma.offlineTime.create({
          data: {
            org_id: caller.org_id,
            user_id: caller.id,
            requested_by_id: caller.id,
            approver_id: caller.id,
            source: 'REQUEST',
            status: 'APPROVED',
            start_time: start,
            end_time: end,
            description: body.data.description,
            approver_note: isAdminOrOwner
              ? 'Self-approved by Admin'
              : 'Self-approved (manager, allowed offline time)',
            expires_at: null,
          },
          select: offlineTimeSelect,
        })
        return reply.status(201).send({ offline_time: row })
      }

      const isManager = caller.role === 'MANAGER'
      const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS)

      const row = await prisma.offlineTime.create({
        data: {
          org_id: caller.org_id,
          user_id: caller.id,
          requested_by_id: caller.id,
          source: 'REQUEST',
          status: 'PENDING',
          start_time: start,
          end_time: end,
          description: body.data.description,
          expires_at: expiresAt,
        },
        select: offlineTimeSelect,
      })

      const payload = buildNotificationPayload(row)

      if (isManager) {
        const adminsOwners = await prisma.user.findMany({
          where: { org_id: caller.org_id, status: 'ACTIVE', role: { in: ['ADMIN', 'OWNER'] } },
          select: { id: true, email: true, name: true },
        })
        if (adminsOwners.length > 0) {
          await prisma.notification.createMany({
            data: adminsOwners.map((u) => ({
              org_id: caller.org_id,
              user_id: u.id,
              type: 'OFFLINE_TIME_SUBMITTED' as const,
              payload,
            })),
          })
          for (const u of adminsOwners) {
            sendSSE(u.id, 'notification', { type: 'OFFLINE_TIME_SUBMITTED', ...payload })
            enqueueTransactionalEmail({
              kind: 'raw',
              to: u.email,
              subject: `Offline time request from ${caller.name}`,
              text: `${caller.name} submitted an offline time request (${row.start_time} – ${row.end_time}): ${row.description}`,
            }).catch(() => {})
          }
        }
      } else {
        const managerIds = await findManagersForUser(caller.org_id, caller.id)
        if (managerIds.length > 0) {
          const managers = await prisma.user.findMany({
            where: { id: { in: managerIds }, status: 'ACTIVE' },
            select: { id: true, email: true, name: true },
          })
          if (managers.length > 0) {
            await prisma.notification.createMany({
              data: managers.map((u) => ({
                org_id: caller.org_id,
                user_id: u.id,
                type: 'OFFLINE_TIME_SUBMITTED' as const,
                payload,
              })),
            })
            for (const u of managers) {
              sendSSE(u.id, 'notification', { type: 'OFFLINE_TIME_SUBMITTED', ...payload })
              enqueueTransactionalEmail({
                kind: 'raw',
                to: u.email,
                subject: `Offline time request from ${caller.name}`,
                text: `${caller.name} submitted an offline time request (${row.start_time} – ${row.end_time}): ${row.description}`,
              }).catch(() => {})
            }
          }
        }
      }

      return reply.status(201).send({ offline_time: row })
    },
  })

  // ── POST /direct-add ──────────────────────────────────────────────────────────
  fastify.post('/direct-add', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      const body = directAddBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const { user_id: targetId } = body.data
      const start = new Date(body.data.start_time)
      const end = new Date(body.data.end_time)
      if (end <= start) {
        return reply
          .status(400)
          .send({ code: 'INVALID_RANGE', message: 'end_time must be after start_time' })
      }
      if (end.getTime() > Date.now()) {
        return reply
          .status(422)
          .send({ code: 'FUTURE_TIME', message: 'end_time cannot be in the future' })
      }

      const subject = await prisma.user.findFirst({
        where: { id: targetId, org_id: caller.org_id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!subject) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }
      if (!(await canAccessOrgUser(caller, targetId))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }
      if (await hasApprovedOverlap(caller.org_id, targetId, start, end)) {
        return reply
          .status(409)
          .send({ code: 'OVERLAP', message: 'Overlaps an existing approved entry' })
      }

      const row = await prisma.offlineTime.create({
        data: {
          org_id: caller.org_id,
          user_id: targetId,
          requested_by_id: caller.id,
          approver_id: caller.id,
          source: 'DIRECT_ADD',
          status: 'APPROVED',
          start_time: start,
          end_time: end,
          description: body.data.description,
          expires_at: null,
        },
        select: offlineTimeSelect,
      })

      const payload = buildNotificationPayload({ ...row, user_id: targetId })
      await prisma.notification.create({
        data: {
          org_id: caller.org_id,
          user_id: targetId,
          type: 'OFFLINE_TIME_APPROVED',
          payload,
        },
      })
      sendSSE(targetId, 'notification', { type: 'OFFLINE_TIME_APPROVED', ...payload })

      return reply.status(201).send({ offline_time: row })
    },
  })

  // ── GET / ─────────────────────────────────────────────────────────────────────
  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      const parsed = listQuerySchema.safeParse(request.query)
      const q = parsed.success
        ? parsed.data
        : { page: 1, from: undefined, to: undefined, user_id: undefined }

      let targetUserId = caller.id
      if (q.user_id && q.user_id !== caller.id) {
        if (!mayActAsPeopleManager(caller.role)) {
          return reply
            .status(403)
            .send({ code: 'FORBIDDEN', message: 'Cannot list offline time for others' })
        }
        if (!(await canAccessOrgUser(caller, q.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        targetUserId = q.user_id
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

      const [entries, total] = await Promise.all([
        prisma.offlineTime.findMany({
          where,
          orderBy: { start_time: 'desc' },
          skip: (q.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            ...offlineTimeSelect,
            approver: { select: { id: true, name: true } },
          },
        }),
        prisma.offlineTime.count({ where }),
      ])

      return {
        offline_time: entries,
        total,
        page: q.page,
        page_size: PAGE_SIZE,
      }
    },
  })

  // ── GET /pending ──────────────────────────────────────────────────────────────
  fastify.get('/pending', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!

      let userFilter: object | undefined
      if (caller.role === 'MANAGER') {
        const teams = await prisma.team.findMany({
          where: { org_id: caller.org_id, manager_id: caller.id },
          select: { members: { select: { user_id: true } } },
        })
        const memberIds = new Set<string>()
        for (const t of teams) {
          for (const m of t.members) memberIds.add(m.user_id)
        }
        memberIds.add(caller.id)
        userFilter = { user_id: { in: [...memberIds] } }
      }

      const entries = await prisma.offlineTime.findMany({
        where: {
          org_id: caller.org_id,
          status: 'PENDING',
          ...userFilter,
        },
        orderBy: { created_at: 'asc' },
        select: {
          ...offlineTimeSelect,
          user: { select: { id: true, name: true, email: true } },
          requested_by: { select: { id: true, name: true } },
        },
      })

      return { pending: entries, count: entries.length }
    },
  })

  // ── PATCH /:id/approve ────────────────────────────────────────────────────────
  fastify.patch('/:id/approve', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params as { id: string }

      const body = approveBodySchema.safeParse(request.body ?? {})
      const note = body.success ? (body.data.note ?? null) : null

      const rowById = await prisma.offlineTime.findFirst({
        where: { id },
        select: {
          id: true,
          org_id: true,
          status: true,
          approver: { select: { name: true } },
        },
      })
      if (!rowById) {
        return reply
          .status(404)
          .send({ code: 'NOT_FOUND', message: 'Offline time entry not found' })
      }
      if (rowById.org_id !== caller.org_id) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'This offline time entry belongs to another organization',
        })
      }
      if (rowById.status !== 'PENDING') {
        const resolverName = rowById.approver?.name ?? 'Unknown'
        await prisma.notification.create({
          data: {
            org_id: caller.org_id,
            user_id: caller.id,
            type: 'OFFLINE_TIME_ALREADY_RESOLVED',
            payload: { offline_time_id: id, status: rowById.status, resolver: resolverName },
          },
        })
        sendSSE(caller.id, 'notification', {
          type: 'OFFLINE_TIME_ALREADY_RESOLVED',
          offline_time_id: id,
          status: rowById.status,
          resolver: resolverName,
        })
        return reply.status(409).send({
          code: 'ALREADY_RESOLVED',
          message: `Already ${rowById.status.toLowerCase()} by ${resolverName}`,
          resolver: resolverName,
          resolver_name: resolverName,
          current_status: rowById.status,
        })
      }

      const result = await prisma.offlineTime.updateMany({
        where: { id, org_id: caller.org_id, status: 'PENDING' },
        data: { status: 'APPROVED', approver_id: caller.id, approver_note: note },
      })

      if (result.count === 0) {
        return reply
          .status(409)
          .send({ code: 'CONFLICT', message: 'Could not update offline time (race). Try again.' })
      }

      const row = await prisma.offlineTime.findUniqueOrThrow({
        where: { id },
        select: { ...offlineTimeSelect, user: { select: { id: true, name: true } } },
      })

      const payload = buildNotificationPayload(row)
      await prisma.notification.create({
        data: {
          org_id: caller.org_id,
          user_id: row.user_id,
          type: 'OFFLINE_TIME_APPROVED',
          payload: { ...payload, approver_name: caller.name },
        },
      })
      sendSSE(row.user_id, 'notification', {
        type: 'OFFLINE_TIME_APPROVED',
        ...payload,
        approver_name: caller.name,
      })

      return { offline_time: row }
    },
  })

  // ── PATCH /:id/reject ─────────────────────────────────────────────────────────
  fastify.patch('/:id/reject', {
    preHandler: [authenticate, requireRole('MANAGER', 'ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const caller = req.user!
      const { id } = request.params as { id: string }

      const body = rejectBodySchema.safeParse(request.body)
      if (!body.success) {
        return reply
          .status(422)
          .send({ code: 'NOTE_REQUIRED', message: 'approver_note is required when rejecting' })
      }

      const rowById = await prisma.offlineTime.findFirst({
        where: { id },
        select: {
          id: true,
          org_id: true,
          status: true,
          approver: { select: { name: true } },
        },
      })
      if (!rowById) {
        return reply
          .status(404)
          .send({ code: 'NOT_FOUND', message: 'Offline time entry not found' })
      }
      if (rowById.org_id !== caller.org_id) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'This offline time entry belongs to another organization',
        })
      }
      if (rowById.status !== 'PENDING') {
        const resolverName = rowById.approver?.name ?? 'Unknown'
        return reply.status(409).send({
          code: 'ALREADY_RESOLVED',
          message: `Already ${rowById.status.toLowerCase()} by ${resolverName}`,
          resolver: resolverName,
          resolver_name: resolverName,
          current_status: rowById.status,
        })
      }

      const result = await prisma.offlineTime.updateMany({
        where: { id, org_id: caller.org_id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          approver_id: caller.id,
          approver_note: body.data.approver_note,
        },
      })

      if (result.count === 0) {
        return reply
          .status(409)
          .send({ code: 'CONFLICT', message: 'Could not update offline time (race). Try again.' })
      }

      const row = await prisma.offlineTime.findUniqueOrThrow({
        where: { id },
        select: { ...offlineTimeSelect, user: { select: { id: true, name: true } } },
      })

      const payload = buildNotificationPayload(row)
      await prisma.notification.create({
        data: {
          org_id: caller.org_id,
          user_id: row.user_id,
          type: 'OFFLINE_TIME_REJECTED',
          payload: {
            ...payload,
            approver_name: caller.name,
            approver_note: body.data.approver_note,
          },
        },
      })
      sendSSE(row.user_id, 'notification', {
        type: 'OFFLINE_TIME_REJECTED',
        ...payload,
        approver_name: caller.name,
        approver_note: body.data.approver_note,
      })

      return { offline_time: row }
    },
  })

  // ── DELETE /:id ───────────────────────────────────────────────────────────────
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

      if (row.status !== 'PENDING') {
        return reply
          .status(403)
          .send({ code: 'FORBIDDEN', message: 'Only PENDING entries can be deleted' })
      }

      await prisma.offlineTime.delete({ where: { id } })
      return { deleted: true }
    },
  })
}
