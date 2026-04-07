import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { registerSSE } from '../../lib/sse.js'

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

const HEARTBEAT_MS = 25_000

export async function notificationRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/stream', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user!.id

      reply.hijack()
      reply.raw.writeHead(200, SSE_HEADERS as unknown as Record<string, string | number | string[]>)

      const res = reply.raw
      const heartbeat: ReturnType<typeof setInterval> = setInterval(() => {
        if (res.writableEnded) return
        try {
          res.write(': ping\n\n')
        } catch {
          clearInterval(heartbeat)
        }
      }, HEARTBEAT_MS)

      registerSSE(userId, res, () => clearInterval(heartbeat))
    },
  })

  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request) => {
      const req = request as AuthenticatedRequest
      const userId = req.user!.id

      const notifications = await prisma.notification.findMany({
        where: { user_id: userId, read_at: null },
        orderBy: { created_at: 'desc' },
        take: 50,
        select: {
          id: true,
          org_id: true,
          type: true,
          payload: true,
          read_at: true,
          created_at: true,
        },
      })

      return { notifications }
    },
  })

  const patchParamsSchema = z.object({
    id: z.string().uuid(),
  })

  fastify.patch('/:id/read', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user!.id
      const parsed = patchParamsSchema.safeParse(request.params)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const { id } = parsed.data

      const existing = await prisma.notification.findFirst({
        where: { id, user_id: userId },
      })
      if (!existing) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Notification not found' })
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { read_at: new Date() },
        select: {
          id: true,
          read_at: true,
        },
      })

      return { notification: updated }
    },
  })
}
