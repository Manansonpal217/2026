import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const activityLogSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  window_start: z.string().datetime(),
  window_end: z.string().datetime(),
  keyboard_events: z.number().int().min(0).default(0),
  mouse_clicks: z.number().int().min(0).default(0),
  mouse_distance_px: z.number().int().min(0).default(0),
  active_app: z.string().max(255).nullable().optional(),
  active_url: z.string().max(2048).nullable().optional(),
  activity_score: z.number().min(0).max(100).default(0),
})

const batchSchema = z.object({
  logs: z.array(activityLogSchema).min(1).max(200),
})

export async function activitySyncRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.post('/batch', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const body = batchSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      // Collect referenced session IDs for ownership validation
      const sessionIds = [...new Set(body.data.logs.map((l) => l.session_id))]
      const validSessions = await prisma.timeSession.findMany({
        where: { id: { in: sessionIds }, user_id: user.id, org_id: user.org_id },
        select: { id: true },
      })
      const validSessionSet = new Set(validSessions.map((s) => s.id))

      const synced: string[] = []
      const errors: { id: string; reason: string }[] = []

      for (const log of body.data.logs) {
        if (!validSessionSet.has(log.session_id)) {
          errors.push({ id: log.id, reason: 'Session not found or does not belong to you' })
          continue
        }

        try {
          await prisma.activityLog.upsert({
            where: { id: log.id },
            create: {
              id: log.id,
              session_id: log.session_id,
              user_id: user.id,
              org_id: user.org_id,
              window_start: new Date(log.window_start),
              window_end: new Date(log.window_end),
              keyboard_events: log.keyboard_events,
              mouse_clicks: log.mouse_clicks,
              mouse_distance_px: log.mouse_distance_px,
              active_app: log.active_app ?? null,
              active_url: log.active_url ?? null,
              activity_score: log.activity_score,
            },
            update: {
              keyboard_events: log.keyboard_events,
              mouse_clicks: log.mouse_clicks,
              mouse_distance_px: log.mouse_distance_px,
              active_app: log.active_app ?? undefined,
              active_url: log.active_url ?? undefined,
              activity_score: log.activity_score,
            },
          })
          synced.push(log.id)
        } catch (err) {
          errors.push({
            id: log.id,
            reason: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      return { synced, errors }
    },
  })
}
