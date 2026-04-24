import type { FastifyInstance } from 'fastify'
import { subDays } from 'date-fns'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { generateSignedUrl } from '../../lib/s3.js'
import {
  aggregateOfflineTimeForUser,
  aggregateSessionsForUser,
  getZonedBucketBounds,
} from '../../lib/zoned-buckets.js'
import { userWhereVisibleToOrgPeers } from '../../lib/permissions.js'
import { timeApprovalTotalsFilter } from '../../lib/time-approval-scope.js'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

const teamSummaryQuerySchema = z.object({
  org_id: z.string().uuid().optional(),
})

type SessionRow = {
  id: string
  user_id: string
  started_at: Date
  ended_at: Date | null
}

export async function dashboardTeamSummaryRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/team-summary', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const q = teamSummaryQuerySchema.safeParse(request.query)
      if (!q.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid query',
          errors: q.error.flatten(),
        })
      }
      const requestedOrgId = q.data.org_id

      if (requestedOrgId && !user.is_platform_admin) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Organization filter is only available to platform administrators',
        })
      }

      if (requestedOrgId) {
        const exists = await prisma.organization.findUnique({
          where: { id: requestedOrgId },
          select: { id: true },
        })
        if (!exists) {
          return reply.status(404).send({
            code: 'ORG_NOT_FOUND',
            message: 'Organization not found',
          })
        }
      }

      const peer = userWhereVisibleToOrgPeers(user)

      const whereUsers =
        user.is_platform_admin && !requestedOrgId
          ? {}
          : user.is_platform_admin && requestedOrgId
            ? { org_id: requestedOrgId }
            : user.role === 'OWNER'
              ? { org_id: user.org_id }
              : user.role === 'ADMIN'
                ? { org_id: user.org_id, AND: [peer] }
                : user.role === 'MANAGER'
                  ? {
                      org_id: user.org_id,
                      AND: [
                        {
                          OR: [
                            { id: user.id },
                            { manager_id: user.id },
                            {
                              team_memberships: {
                                some: { team: { org_id: user.org_id, manager_id: user.id } },
                              },
                            },
                          ],
                        },
                        peer,
                      ],
                    }
                  : { org_id: user.org_id, id: user.id, AND: [peer] }

      const users = await prisma.user.findMany({
        where: whereUsers,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          timezone: true,
          org_id: true,
          ...(user.is_platform_admin ? { organization: { select: { name: true } } } : {}),
        },
      })

      const usersInOrg = users.filter((u): u is typeof u & { org_id: string } => u.org_id != null)

      const userIds = usersInOrg.map((u) => u.id)
      const now = new Date()

      if (userIds.length === 0) {
        return {
          scope: user.is_platform_admin ? (requestedOrgId ? 'org' : 'platform') : 'org',
          users: [],
        }
      }

      let minRangeStart = now.getTime()
      for (const u of usersInOrg) {
        const b = getZonedBucketBounds(now, u.timezone)
        minRangeStart = Math.min(
          minRangeStart,
          b.monthStart.getTime(),
          b.weekStart.getTime(),
          b.yesterdayStart.getTime(),
          b.todayStart.getTime()
        )
      }

      const queryFrom = subDays(new Date(minRangeStart), 1)
      const openSessionCutoff = subDays(queryFrom, 45)

      const usersByOrg = new Map<string, typeof usersInOrg>()
      for (const u of usersInOrg) {
        const list = usersByOrg.get(u.org_id) ?? []
        list.push(u)
        usersByOrg.set(u.org_id, list)
      }

      const sessionWhereBase = {
        started_at: { lt: now },
        OR: [
          { ended_at: { gt: queryFrom } },
          { AND: [{ ended_at: null }, { started_at: { gte: openSessionCutoff } }] },
        ],
      }

      const [sessionChunks, offlineChunks] = await Promise.all([
        Promise.all(
          [...usersByOrg.entries()].map(async ([orgId, orgUsers]) => {
            const ids = orgUsers.map((x) => x.id)
            const approvalTotals = await timeApprovalTotalsFilter(orgId)
            return prisma.timeSession.findMany({
              where: {
                org_id: orgId,
                user_id: { in: ids },
                ...approvalTotals,
                ...sessionWhereBase,
              },
              select: {
                id: true,
                user_id: true,
                started_at: true,
                ended_at: true,
              },
            })
          })
        ),
        Promise.all(
          [...usersByOrg.entries()].map(async ([orgId, orgUsers]) => {
            const ids = orgUsers.map((x) => x.id)
            return prisma.offlineTime.findMany({
              where: {
                org_id: orgId,
                user_id: { in: ids },
                status: 'APPROVED',
                end_time: { gt: queryFrom },
                start_time: { lt: now },
              },
              select: {
                user_id: true,
                start_time: true,
                end_time: true,
              },
            })
          })
        ),
      ])

      const sessions = sessionChunks.flat()
      const offlineRows = offlineChunks.flat()

      const latestShotsRaw = await Promise.all(
        usersInOrg.map((u) =>
          prisma.screenshot.findFirst({
            where: { org_id: u.org_id, user_id: u.id, deleted_at: null },
            orderBy: { taken_at: 'desc' },
            select: {
              id: true,
              user_id: true,
              taken_at: true,
              activity_score: true,
              s3_key: true,
              thumb_s3_key: true,
            },
          })
        )
      )

      const sessionRows = sessions as SessionRow[]
      const sessionIds = sessionRows.map((s) => s.id)
      const deductionRows = await prisma.sessionTimeDeduction.findMany({
        where: { session_id: { in: sessionIds } },
        select: { session_id: true, range_start: true, range_end: true },
      })
      const deductionsBySession = new Map<string, { range_start: Date; range_end: Date }[]>()
      for (const d of deductionRows) {
        const list = deductionsBySession.get(d.session_id) ?? []
        list.push({ range_start: d.range_start, range_end: d.range_end })
        deductionsBySession.set(d.session_id, list)
      }

      const latestByUser = new Map<
        string,
        {
          id: string
          taken_at: Date
          activity_score: number
          s3_key: string
          thumb_s3_key: string | null
        }
      >()
      for (const s of latestShotsRaw) {
        if (s) {
          latestByUser.set(s.user_id, {
            id: s.id,
            taken_at: s.taken_at,
            activity_score: s.activity_score,
            s3_key: s.s3_key,
            thumb_s3_key: s.thumb_s3_key,
          })
        }
      }

      const results = await Promise.all(
        usersInOrg.map(async (u) => {
          const bounds = getZonedBucketBounds(now, u.timezone)
          const agg = aggregateSessionsForUser({
            sessions: sessionRows,
            userId: u.id,
            now,
            bounds,
            deductionsBySession,
          })
          const offAgg = aggregateOfflineTimeForUser({
            entries: offlineRows,
            userId: u.id,
            now,
            bounds,
          })

          const shot = latestByUser.get(u.id)
          const shotMs = shot ? shot.taken_at.getTime() : 0
          const sessionMs = agg.lastInstantMs
          const lastMs = Math.max(sessionMs, shotMs, offAgg.lastInstantMs)

          let latest_screenshot: {
            id: string
            taken_at: string
            signed_url: string | null
            thumb_signed_url: string | null
            activity_score: number
          } | null = null
          if (shot) {
            let signed_url: string | null = null
            let thumb_signed_url: string | null = null
            try {
              signed_url = await generateSignedUrl(opts.config, shot.s3_key, 900)
            } catch {
              signed_url = null
            }
            if (shot.thumb_s3_key) {
              try {
                thumb_signed_url = await generateSignedUrl(opts.config, shot.thumb_s3_key, 900)
              } catch {
                thumb_signed_url = null
              }
            }
            latest_screenshot = {
              id: shot.id,
              taken_at: shot.taken_at.toISOString(),
              signed_url,
              thumb_signed_url,
              activity_score: shot.activity_score,
            }
          }

          const last = lastMs > 0 ? new Date(lastMs) : null
          const is_online = lastMs > 0 && now.getTime() - lastMs < ONLINE_WINDOW_MS

          const row: Record<string, unknown> = {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            timezone: u.timezone,
            last_active: last ? last.toISOString() : null,
            is_online,
            today_seconds: agg.today_seconds + offAgg.today_seconds,
            yesterday_seconds: agg.yesterday_seconds + offAgg.yesterday_seconds,
            this_week_seconds: agg.this_week_seconds + offAgg.this_week_seconds,
            this_month_seconds: agg.this_month_seconds + offAgg.this_month_seconds,
            latest_screenshot,
          }

          if (user.is_platform_admin) {
            row.org_id = u.org_id
            row.org_name = 'organization' in u && u.organization ? u.organization.name : null
          }

          return row
        })
      )

      return {
        scope: user.is_platform_admin ? (requestedOrgId ? 'org' : 'platform') : 'org',
        users: results,
      }
    },
  })
}
