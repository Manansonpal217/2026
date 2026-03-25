import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { overlapSeconds } from '../../lib/time-session-overlap.js'

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  user_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function sessionListRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!

      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
      }
      const query = parsed.data

      const canViewOthers = ['admin', 'super_admin', 'manager'].includes(user.role)
      const targetUserId = canViewOthers && query.user_id ? query.user_id : user.id

      const fromDate = query.from ? new Date(query.from) : undefined
      const toDate = query.to ? new Date(query.to) : undefined
      const now = new Date()

      /** When both bounds exist, use interval overlap (sessions spanning midnight, etc.). */
      const usesOverlap =
        fromDate !== undefined &&
        toDate !== undefined &&
        !Number.isNaN(fromDate.getTime()) &&
        !Number.isNaN(toDate.getTime())

      const overlapWhere = usesOverlap
        ? {
            AND: [
              { started_at: { lt: toDate } },
              { OR: [{ ended_at: null }, { ended_at: { gt: fromDate } }] },
            ],
          }
        : fromDate || toDate
          ? {
              started_at: {
                ...(fromDate && { gte: fromDate }),
                ...(toDate && { lte: toDate }),
              },
            }
          : {}

      const where = {
        org_id: user.org_id,
        user_id: targetUserId,
        ...(query.project_id && { project_id: query.project_id }),
        ...overlapWhere,
      }

      const [sessions, total, aggregateRows] = await Promise.all([
        prisma.timeSession.findMany({
          where,
          orderBy: { started_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            project: { select: { id: true, name: true, color: true } },
            task: { select: { id: true, name: true } },
            user: { select: { id: true, name: true, email: true } },
            time_deductions: {
              select: { range_start: true, range_end: true },
            },
          },
        }),
        prisma.timeSession.count({ where }),
        usesOverlap
          ? prisma.timeSession.findMany({
              where,
              select: {
                id: true,
                started_at: true,
                ended_at: true,
                time_deductions: { select: { range_start: true, range_end: true } },
              },
            })
          : Promise.resolve(
              [] as {
                id: string
                started_at: Date
                ended_at: Date | null
                time_deductions: { range_start: Date; range_end: Date }[]
              }[]
            ),
      ])

      let total_seconds: number
      if (usesOverlap && fromDate && toDate) {
        total_seconds = aggregateRows.reduce((sum, s) => {
          const raw = overlapSeconds(s.started_at, s.ended_at ?? now, fromDate, toDate)
          const sub = (s.time_deductions ?? []).reduce(
            (t, d) => t + overlapSeconds(d.range_start, d.range_end, fromDate, toDate),
            0
          )
          return sum + Math.max(0, raw - sub)
        }, 0)
      } else {
        const forSum = await prisma.timeSession.findMany({
          where,
          select: { id: true, duration_sec: true },
        })
        const sumIds = forSum.map((s) => s.id)
        const deductRows =
          sumIds.length > 0
            ? await prisma.sessionTimeDeduction.findMany({
                where: { session_id: { in: sumIds } },
                select: { session_id: true, range_start: true, range_end: true },
              })
            : []
        const deductBySession = new Map<string, number>()
        for (const d of deductRows) {
          const sec = Math.max(
            0,
            Math.floor((d.range_end.getTime() - d.range_start.getTime()) / 1000)
          )
          deductBySession.set(d.session_id, (deductBySession.get(d.session_id) ?? 0) + sec)
        }
        total_seconds = forSum.reduce(
          (sum, s) => sum + Math.max(0, s.duration_sec - (deductBySession.get(s.id) ?? 0)),
          0
        )
      }

      return { sessions, total, total_seconds, page: query.page, limit: query.limit }
    },
  })
}
