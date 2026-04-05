import type { FastifyInstance } from 'fastify'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { OVERRIDABLE_KEYS, type OverridableKey, resolveFeature } from '../../lib/settings.js'

export async function appSettingsRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/me', {
    preHandler: [authenticate],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const keys = Object.keys(OVERRIDABLE_KEYS) as OverridableKey[]
      const entries = await Promise.all(
        keys.map(async (key) => {
          const value = await resolveFeature(user.org_id, user.id, key)
          return [key, value] as const
        })
      )

      const settings: Record<string, string> = {}
      for (const [k, v] of entries) settings[k] = v

      return { settings }
    },
  })
}
