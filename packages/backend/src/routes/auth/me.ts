import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { computeUserStreak } from '../../lib/streak.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function meRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get(
    '/me',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as AuthenticatedRequest
      if (!user) {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
      }

      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { organization: true },
      })

      if (!fullUser) {
        return reply.status(404).send({ code: 'USER_NOT_FOUND', message: 'User no longer exists' })
      }

      const [orgSettings, streak] = await Promise.all([
        prisma.orgSettings.findUnique({ where: { org_id: fullUser.org_id } }),
        computeUserStreak(fullUser.id, fullUser.timezone),
      ])

      return {
        user: {
          id: fullUser.id,
          name: fullUser.name,
          email: fullUser.email,
          role: fullUser.role,
          org_id: fullUser.organization.id,
          org_name: fullUser.organization.name,
          is_platform_admin: fullUser.is_platform_admin,
          streak,
        },
        org: {
          id: fullUser.organization.id,
          name: fullUser.organization.name,
          status: fullUser.organization.status,
          plan: fullUser.organization.plan,
        },
        org_settings: orgSettings
          ? {
              screenshot_interval_seconds: orgSettings.screenshot_interval_seconds,
              screenshot_retention_days: orgSettings.screenshot_retention_days,
              blur_screenshots: orgSettings.blur_screenshots,
              time_approval_required: orgSettings.time_approval_required,
              idle_detection_enabled: orgSettings.idle_detection_enabled,
              idle_timeout_minutes: orgSettings.idle_timeout_minutes,
              idle_timeout_intervals: orgSettings.idle_timeout_intervals,
              expected_daily_work_minutes: orgSettings.expected_daily_work_minutes,
            }
          : null,
      }
    }
  )
}
