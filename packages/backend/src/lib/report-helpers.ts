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

export type ResolveUserIdsOptions = {
  /** When set, results are limited to members of this team (must belong to the same org). */
  teamId?: string
}

/**
 * Resolve accessible user IDs for the request.
 * Managers are scoped to their direct reports + self.
 * Admin/Owner see all org users.
 * Optional `teamId` intersects the resolved set with that team's members.
 * Returns the resolved user IDs array or sends a 403/404 and returns null.
 */
export async function resolveUserIds(
  req: AuthenticatedRequest,
  reply: FastifyReply,
  requestedUserIds?: string[],
  options?: ResolveUserIdsOptions
): Promise<string[] | null> {
  const user = req.user!

  let resolved: string[]

  if (requestedUserIds && requestedUserIds.length > 0) {
    if (!mayActAsPeopleManager(user.role)) {
      // Non-managers can only see their own data
      if (requestedUserIds.length !== 1 || requestedUserIds[0] !== user.id) {
        reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        return null
      }
      resolved = [user.id]
    } else {
      const accessible = await filterAccessibleUserIds(user, requestedUserIds)
      if (accessible.length !== requestedUserIds.length) {
        reply
          .status(403)
          .send({ code: 'FORBIDDEN', message: 'Access denied for one or more users' })
        return null
      }
      resolved = accessible
    }
  } else if (!mayActAsPeopleManager(user.role)) {
    resolved = [user.id]
  } else if (user.role === 'MANAGER') {
    const reports = await prisma.user.findMany({
      where: { manager_id: user.id, org_id: user.org_id, status: 'ACTIVE' },
      select: { id: true },
    })
    resolved = [user.id, ...reports.map((r) => r.id)]
  } else {
    const allUsers = await prisma.user.findMany({
      where: { org_id: user.org_id, status: 'ACTIVE' },
      select: { id: true },
    })
    resolved = allUsers.map((u) => u.id)
  }

  if (options?.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: options.teamId, org_id: user.org_id },
      select: { id: true },
    })
    if (!team) {
      reply.status(404).send({ code: 'NOT_FOUND', message: 'Team not found' })
      return null
    }
    const members = await prisma.teamMember.findMany({
      where: { team_id: options.teamId },
      select: { user_id: true },
    })
    const memberSet = new Set(members.map((m) => m.user_id))
    resolved = resolved.filter((id) => memberSet.has(id))
  }

  return resolved
}

/** Map idle sensitivity (minutes) to max activity score still treated as "idle" (1–99). */
export function idleScoreThresholdFromMinutes(minutes: number): number {
  return Math.max(1, Math.min(99, 100 - minutes * 3))
}

/** Build the meta object for report responses. */
export function reportMeta(from: string | Date, to: string | Date, total?: number) {
  const f = from instanceof Date ? from.toISOString() : from
  const t = to instanceof Date ? to.toISOString() : to
  return { from: f, to: t, ...(total !== undefined ? { total } : {}) }
}
