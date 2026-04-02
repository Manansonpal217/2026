import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { computeUserStreak } from '../../lib/streak.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import { userWhereVisibleToOrgPeers } from '../../lib/permissions.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

export async function adminStreaksRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/streaks', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER', 'MANAGER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const orgId = req.user!.org_id

      const u = req.user!
      const users = await prisma.user.findMany({
        where: {
          org_id: orgId,
          status: 'ACTIVE',
          AND: [
            ...(u.role === 'MANAGER' ? [{ OR: [{ id: u.id }, { manager_id: u.id }] }] : []),
            userWhereVisibleToOrgPeers(u),
          ],
        },
        select: { id: true, name: true, email: true, timezone: true },
      })

      const usersWithStreaks = await Promise.all(
        users.map(async (u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          streak: await computeUserStreak(u.id, u.timezone),
        }))
      )

      return {
        users: usersWithStreaks.sort((a, b) => b.streak - a.streak),
      }
    },
  })
}
