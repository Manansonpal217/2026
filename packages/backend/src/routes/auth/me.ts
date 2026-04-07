import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { computeUserStreak } from '../../lib/streak.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import {
  Permission,
  hasPermission,
  type Permission as PermissionKey,
} from '../../lib/permissions.js'
import { toPublicOrgSettings } from '../../lib/org-settings-fields.js'

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

      const principal = {
        id: fullUser.id,
        org_id: fullUser.org_id,
        role: fullUser.role as string,
      }
      const access_scope =
        (fullUser.role as string) === 'OWNER' || (fullUser.role as string) === 'ADMIN'
          ? 'org'
          : (fullUser.role as string) === 'MANAGER'
            ? 'direct_reports'
            : 'self'
      const permissions = (Object.values(Permission) as PermissionKey[]).filter((p) =>
        hasPermission(principal, p)
      )

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
          timezone: fullUser.organization.timezone,
          status: fullUser.organization.status,
          plan: fullUser.organization.plan,
        },
        org_settings: toPublicOrgSettings(orgSettings),
        authz: {
          access_scope,
          permissions,
        },
      }
    }
  )
}
