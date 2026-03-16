import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { getRegistry } from '../../lib/integrations/registry.js'

export async function integrationConnectRoutes(
  fastify: FastifyInstance,
  opts: { config: Config },
) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/connect/:provider', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { provider } = request.params as { provider: string }
      const query = request.query as { redirect_uri?: string }

      const adapter = getRegistry().get(provider)
      if (!adapter) {
        return reply.status(400).send({ code: 'UNKNOWN_PROVIDER', message: `Unknown integration provider: ${provider}` })
      }

      const redirectUri = query.redirect_uri ?? `${opts.config.APP_URL}/v1/integrations/callback`

      // Create single-use OAuthState (15 min expiry)
      const oauthState = await prisma.oAuthState.create({
        data: {
          org_id: user.org_id,
          provider,
          redirect_uri: redirectUri,
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        },
      })

      const authUrl = adapter.oauthAuthUrl(oauthState.state, redirectUri)

      return { auth_url: authUrl, state: oauthState.state }
    },
  })
}
