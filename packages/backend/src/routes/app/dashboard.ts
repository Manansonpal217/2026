/**
 * GET /v1/app/dashboard
 * Returns the authenticated user's personal dashboard data including streak info.
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function appDashboardRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/dashboard', {
    preHandler: [authenticate],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const now = new Date()

      // Fetch streak, today's sessions, and org timezone in parallel
      const [streak, org, todaySessions] = await Promise.all([
        prisma.streak.findUnique({
          where: { user_id: user.id },
          select: {
            current_streak: true,
            longest_streak: true,
            last_active_date: true,
          },
        }),
        prisma.organization.findUnique({
          where: { id: user.org_id },
          select: { timezone: true },
        }),
        prisma.timeSession.findMany({
          where: {
            user_id: user.id,
            ended_at: { not: null },
            duration_sec: { gt: 0 },
            // Started within last 24h as a quick filter; accurate bucketing done below
            started_at: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
          select: { duration_sec: true, started_at: true },
        }),
      ])

      const tz = org?.timezone || 'UTC'

      // Today's seconds in user's org timezone
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz })
      const todaySeconds = todaySessions
        .filter((s) => s.started_at.toLocaleDateString('en-CA', { timeZone: tz }) === todayStr)
        .reduce((sum, s) => sum + s.duration_sec, 0)

      return {
        streak: {
          current_streak: streak?.current_streak ?? 0,
          longest_streak: streak?.longest_streak ?? 0,
          last_active_date: streak?.last_active_date?.toISOString() ?? null,
        },
        today_seconds: todaySeconds,
        timezone: tz,
      }
    },
  })
}
