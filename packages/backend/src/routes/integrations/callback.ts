import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import type { Config } from '../../config.js'
import { getAdapter } from '../../lib/integrations/registry.js'
import { encryptAuthData } from '../../lib/integrations/kms.js'

export async function integrationCallbackRoutes(
  fastify: FastifyInstance,
  opts: { config: Config }
) {
  fastify.get('/callback', {
    handler: async (request, reply) => {
      const query = request.query as {
        code?: string
        state?: string
        error?: string
        error_description?: string
      }

      if (query.error) {
        return reply.redirect(
          `${opts.config.APP_URL}/admin?error=${encodeURIComponent(query.error_description ?? query.error)}`
        )
      }

      if (!query.code || !query.state) {
        return reply
          .status(400)
          .send({ code: 'MISSING_PARAMS', message: 'Missing code or state parameter' })
      }

      // Find and validate state token
      const oauthState = await prisma.oAuthState.findFirst({
        where: { state: query.state },
      })

      if (!oauthState) {
        return reply.status(400).send({ code: 'INVALID_STATE', message: 'Invalid OAuth state' })
      }

      if (oauthState.used) {
        return reply.status(400).send({ code: 'STATE_REUSED', message: 'OAuth state already used' })
      }

      if (oauthState.expires_at < new Date()) {
        return reply.status(400).send({ code: 'STATE_EXPIRED', message: 'OAuth state expired' })
      }

      // Mark state as used immediately (single-use enforcement)
      await prisma.oAuthState.update({
        where: { id: oauthState.id },
        data: { used: true },
      })

      let adapter
      try {
        adapter = getAdapter(oauthState.provider)
      } catch {
        return reply
          .status(503)
          .send({
            code: 'INTEGRATION_NOT_CONFIGURED',
            message: 'Integration provider is not available',
          })
      }

      try {
        // Exchange code for tokens (with PKCE code_verifier if stored)
        const tokens = await adapter.exchangeCode(
          query.code,
          oauthState.redirect_uri,
          oauthState.code_verifier ?? undefined
        )

        // Encrypt tokens with KMS
        const encryptedTokens = await encryptAuthData(tokens, opts.config)

        // Create or update Integration record
        const integration = await prisma.integration.upsert({
          where: {
            id: oauthState.integration_id ?? 'non-existent',
          },
          create: {
            org_id: oauthState.org_id,
            type: oauthState.provider,
            name: adapter.displayName,
            status: 'ACTIVE',
            auth_data: encryptedTokens,
            kms_key_id: opts.config.KMS_INTEGRATIONS_KEY_ID ?? 'local',
          },
          update: {
            auth_data: encryptedTokens,
            status: 'ACTIVE',
            kms_key_id: opts.config.KMS_INTEGRATIONS_KEY_ID ?? 'local',
          },
        })

        // Update OAuthState with integration_id
        await prisma.oAuthState.update({
          where: { id: oauthState.id },
          data: { integration_id: integration.id },
        })

        // Enqueue first sync
        const { getIntegrationQueue } = await import('../../queues/index.js')
        const queue = getIntegrationQueue()
        await queue.add(
          'sync',
          { integrationId: integration.id, orgId: oauthState.org_id },
          { jobId: `integrationSync:${integration.id}`, attempts: 3 }
        )

        return reply.redirect(`${opts.config.APP_URL}/admin?connected=${oauthState.provider}`)
      } catch (err) {
        console.error('[OAuth callback] Error:', err)
        return reply.redirect(
          `${opts.config.APP_URL}/admin?error=${encodeURIComponent('Failed to connect integration')}`
        )
      }
    },
  })
}
