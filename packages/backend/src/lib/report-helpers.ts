import { z } from 'zod'
import type { FastifyReply } from 'fastify'
import type { AuthenticatedRequest } from '../middleware/authenticate.js'
import { filterAccessibleUserIds, mayActAsPeopleManager } from './permissions.js'
import { prisma } from '../db/prisma.js'

/** Common date-range + user/project filter schema. */
export const baseDateRangeSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
})

export const baseUserFilterSchema = baseDateRangeSchema.extend({
  user_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  team_id: z.string().optional(),
})

export const baseProjectFilterSchema = baseUserFilterSchema.extend({
  project_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
})

/** Parse user IDs array from query param. */
export function parseIds(raw: string | string[] | undefined): string[] | undefined {
  if (!raw) return undefined
  return Array.isArray(raw) ? raw : [raw]
}

/**
 * Resolve accessible user IDs for the request.
 * Managers are scoped to their direct reports + self.
 * Admin/Owner see all org users.
 * Returns the resolved user IDs array or sends a 403 and returns null.
 */
export async function resolveUserIds(
  req: AuthenticatedRequest,
  reply: FastifyReply,
  requestedUserIds?: string[]
): Promise<string[] | null> {
  const user = req.user!

  if (requestedUserIds && requestedUserIds.length > 0) {
    if (!mayActAsPeopleManager(user.role)) {
      // Non-managers can only see their own data
      if (requestedUserIds.length !== 1 || requestedUserIds[0] !== user.id) {
        reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        return null
      }
      return [user.id]
    }
    const accessible = await filterAccessibleUserIds(user, requestedUserIds)
    if (accessible.length !== requestedUserIds.length) {
      reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied for one or more users' })
      return null
    }
    return accessible
  }

  // No specific users requested — scope by role
  if (!mayActAsPeopleManager(user.role)) {
    return [user.id]
  }

  if (user.role === 'MANAGER') {
    // Manager sees self + direct reports
    const reports = await prisma.user.findMany({
      where: { manager_id: user.id, org_id: user.org_id, status: 'ACTIVE' },
      select: { id: true },
    })
    return [user.id, ...reports.map((r) => r.id)]
  }

  // ADMIN/OWNER — all org users
  const allUsers = await prisma.user.findMany({
    where: { org_id: user.org_id, status: 'ACTIVE' },
    select: { id: true },
  })
  return allUsers.map((u) => u.id)
}

/** Build the meta object for report responses. */
export function reportMeta(from: string | Date, to: string | Date, total?: number) {
  const f = from instanceof Date ? from.toISOString() : from
  const t = to instanceof Date ? to.toISOString() : to
  return { from: f, to: t, ...(total !== undefined ? { total } : {}) }
}
