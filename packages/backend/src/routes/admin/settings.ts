import type { FastifyInstance } from 'fastify'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { logAuditEvent } from '../../lib/audit.js'
import { SETTINGS_PATCH_KEY_PERMISSION, Permission, hasPermission } from '../../lib/permissions.js'
import {
  orgSettingsScalarPatchSchema as patchSettingsSchema,
  assertActivityWeightsSum,
} from '../../lib/org-settings-fields.js'

export async function adminSettingsRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/settings', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const settings = await prisma.orgSettings.findFirst({
        where: { org_id: req.user!.org_id },
      })
      return { settings }
    },
  })

  fastify.patch('/settings', {
    preHandler: [authenticate, requireRole('ADMIN', 'OWNER')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = patchSettingsSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      for (const key of Object.keys(body.data) as (keyof typeof body.data)[]) {
        if (body.data[key] === undefined) continue
        const perm =
          SETTINGS_PATCH_KEY_PERMISSION[key as string] ?? Permission.SETTINGS_MANAGE_ADVANCED
        if (!hasPermission(user, perm)) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: `Not allowed to change setting: ${String(key)}`,
          })
        }
      }

      const existing = await prisma.orgSettings.findFirst({ where: { org_id: user.org_id } })
      try {
        assertActivityWeightsSum(body.data, existing)
      } catch (e) {
        const err = e as { code?: string; message?: string }
        if (err.code === 'INVALID_WEIGHTS') {
          return reply.status(400).send({
            code: 'INVALID_WEIGHTS',
            message: err.message?.replace(/^INVALID_WEIGHTS: /, '') ?? 'Invalid weights',
          })
        }
        throw e
      }

      const oldValue = existing ?? {}

      const updated = await prisma.orgSettings.upsert({
        where: { org_id: user.org_id },
        create: { org_id: user.org_id, ...body.data },
        update: body.data,
      })

      await logAuditEvent({
        orgId: user.org_id,
        actorId: user.id,
        action: 'setting.changed',
        targetType: 'org_settings',
        targetId: user.org_id,
        oldValue,
        newValue: body.data,
        ip: request.ip,
      })

      return { settings: updated }
    },
  })
}
