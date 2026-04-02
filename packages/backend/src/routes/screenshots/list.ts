import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware, requirePermission } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'
import { canAccessOrgUser, mayActAsPeopleManager, Permission } from '../../lib/permissions.js'
import { deleteFromS3, generateSignedUrl } from '../../lib/s3.js'
import { deductionRangeForDeletedScreenshot } from '../../lib/screenshot-deleted-time.js'

const querySchema = z.object({
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function screenshotListRoutes(fastify: FastifyInstance, opts: { config: Config }) {
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

      if (query.user_id && query.user_id !== user.id && !mayActAsPeopleManager(user.role)) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const targetUserId =
        query.user_id && mayActAsPeopleManager(user.role) ? query.user_id : user.id

      if (query.user_id && query.user_id !== user.id) {
        if (!(await canAccessOrgUser(user, query.user_id))) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
        }
      }

      const where = {
        org_id: user.org_id,
        user_id: targetUserId,
        deleted_at: null,
        ...(query.session_id && { session_id: query.session_id }),
        ...(query.from || query.to
          ? {
              taken_at: {
                ...(query.from && { gte: new Date(query.from) }),
                ...(query.to && { lte: new Date(query.to) }),
              },
            }
          : {}),
      }

      const [screenshots, total] = await Promise.all([
        prisma.screenshot.findMany({
          where,
          orderBy: { taken_at: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.screenshot.count({ where }),
      ])

      // Generate signed URLs (15-min expiry) — never expose raw S3 keys
      const results = await Promise.all(
        screenshots.map(async (s) => ({
          id: s.id,
          session_id: s.session_id,
          taken_at: s.taken_at,
          activity_score: s.activity_score,
          is_blurred: s.is_blurred,
          file_size_bytes: s.file_size_bytes,
          thumb_file_size_bytes: s.thumb_file_size_bytes,
          signed_url: await generateSignedUrl(opts.config, s.s3_key, 900),
          thumb_signed_url: s.thumb_s3_key
            ? await generateSignedUrl(opts.config, s.thumb_s3_key, 900)
            : null,
        }))
      )

      return { screenshots: results, total, page: query.page, limit: query.limit }
    },
  })

  fastify.post('/:id/blur', {
    preHandler: [authenticate, requirePermission(Permission.MANAGERS_ACCESS)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const screenshot = await prisma.screenshot.findFirst({
        where: { id, org_id: user.org_id, deleted_at: null },
      })
      if (!screenshot) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Screenshot not found' })
      }

      if (!(await canAccessOrgUser(user, screenshot.user_id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const { getScreenshotQueue } = await import('../../queues/index.js')
      const queue = getScreenshotQueue()
      await queue.add(
        'process-screenshot',
        {
          screenshotId: screenshot.id,
          s3Key: screenshot.s3_key,
          orgId: user.org_id,
          forceBlur: true,
        },
        { jobId: `screenshot-blur-${screenshot.id}-${Date.now()}`, attempts: 3 }
      )

      return reply.status(202).send({ accepted: true, screenshot_id: screenshot.id })
    },
  })

  fastify.delete('/:id', {
    preHandler: [authenticate, requirePermission(Permission.MANAGERS_ACCESS)],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const user = req.user!
      const { id } = request.params as { id: string }

      const screenshot = await prisma.screenshot.findFirst({
        where: { id, org_id: user.org_id, deleted_at: null },
      })
      if (!screenshot) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Screenshot not found' })
      }

      if (!(await canAccessOrgUser(user, screenshot.user_id))) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' })
      }

      const now = new Date()
      const [session, orgSettings] = await Promise.all([
        prisma.timeSession.findFirst({
          where: { id: screenshot.session_id, org_id: user.org_id },
        }),
        prisma.orgSettings.findUnique({
          where: { org_id: user.org_id },
          select: { screenshot_interval_seconds: true },
        }),
      ])
      const range =
        session &&
        deductionRangeForDeletedScreenshot({
          takenAt: screenshot.taken_at,
          intervalSeconds: orgSettings?.screenshot_interval_seconds ?? 60,
          session,
          now,
        })

      await prisma.$transaction(async (tx) => {
        if (range) {
          await tx.sessionTimeDeduction.create({
            data: {
              org_id: user.org_id,
              session_id: screenshot.session_id,
              range_start: range.range_start,
              range_end: range.range_end,
              reason: 'screenshot_deleted',
            },
          })
        }
        await tx.screenshot.update({
          where: { id },
          data: { deleted_at: now },
        })
      })

      if (screenshot.thumb_s3_key) {
        try {
          await deleteFromS3(opts.config, screenshot.thumb_s3_key)
        } catch {
          /* best-effort */
        }
      }
      try {
        await deleteFromS3(opts.config, screenshot.s3_key)
      } catch {
        /* row already soft-deleted */
      }

      return reply.status(204).send()
    },
  })
}
