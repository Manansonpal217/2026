import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { getRegistry } from '../../lib/integrations/registry.js'
import { generatePkce } from '../../lib/integrations/pkce.js'

export async function integrationConnectRoutes(fastify: FastifyInstance, opts: { config: Config }) {
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
        return reply
          .status(400)
          .send({ code: 'UNKNOWN_PROVIDER', message: `Unknown integration provider: ${provider}` })
      }

      const allowedRedirectUri = `${opts.config.APP_URL.replace(/\/$/, '')}/v1/integrations/callback`
      const requestedUri = query.redirect_uri?.trim()
      let redirectUri: string
      if (requestedUri) {
        try {
          const requested = new URL(requestedUri)
          const allowed = new URL(allowedRedirectUri)
          if (requested.origin !== allowed.origin || requested.pathname !== allowed.pathname) {
            return reply.status(400).send({
              code: 'INVALID_REDIRECT_URI',
              message: 'redirect_uri must match the allowed callback URL',
            })
          }
          redirectUri = requestedUri
        } catch {
          return reply.status(400).send({
            code: 'INVALID_REDIRECT_URI',
            message: 'redirect_uri must be a valid URL',
          })
        }
      } else {
        redirectUri = allowedRedirectUri
      }

      const { codeVerifier, codeChallenge } = generatePkce()

      // Create single-use OAuthState (15 min expiry) with PKCE
      const oauthState = await prisma.oAuthState.create({
        data: {
          org_id: user.org_id,
          provider,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        },
      })

      const authUrl = adapter.oauthAuthUrl(oauthState.state, redirectUri, codeChallenge)

      return { auth_url: authUrl, state: oauthState.state }
    },
  })
}
