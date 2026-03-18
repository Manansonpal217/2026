import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requireRole } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { logAuditEvent } from '../../lib/audit.js'

const patchSettingsSchema = z.object({
  screenshot_interval_seconds: z.number().int().min(60).max(3600).optional(),
  screenshot_retention_days: z.number().int().min(7).max(365).optional(),
  blur_screenshots: z.boolean().optional(),
  activity_weight_keyboard: z.number().min(0).max(1).optional(),
  activity_weight_mouse: z.number().min(0).max(1).optional(),
  activity_weight_movement: z.number().min(0).max(1).optional(),
  track_keyboard: z.boolean().optional(),
  track_mouse: z.boolean().optional(),
  track_app_usage: z.boolean().optional(),
  track_url: z.boolean().optional(),
  time_approval_required: z.boolean().optional(),
  mfa_required_for_admins: z.boolean().optional(),
  mfa_required_for_managers: z.boolean().optional(),
})

export async function adminSettingsRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/settings', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const settings = await prisma.orgSettings.findFirst({
        where: { org_id: req.user!.org_id },
      })
      return { settings }
    },
  })

  fastify.patch('/settings', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = patchSettingsSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      // Validate activity weights sum to ~1.0 if all three are provided
      const {
        activity_weight_keyboard: k,
        activity_weight_mouse: m,
        activity_weight_movement: mv,
      } = body.data
      if (k !== undefined || m !== undefined || mv !== undefined) {
        const existing = await prisma.orgSettings.findFirst({ where: { org_id: user.org_id } })
        const finalK = k ?? existing?.activity_weight_keyboard ?? 0.5
        const finalM = m ?? existing?.activity_weight_mouse ?? 0.3
        const finalMv = mv ?? existing?.activity_weight_movement ?? 0.2
        const sum = finalK + finalM + finalMv
        if (Math.abs(sum - 1.0) > 0.01) {
          return reply.status(400).send({
            code: 'INVALID_WEIGHTS',
            message: `Activity weights must sum to 1.0, got ${sum.toFixed(3)}`,
          })
        }
      }

      const existing = await prisma.orgSettings.findFirst({ where: { org_id: user.org_id } })
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
