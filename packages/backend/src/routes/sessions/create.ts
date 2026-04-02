import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import { createAuthenticateMiddleware } from '../../middleware/authenticate.js'
import type { AuthenticatedRequest } from '../../middleware/authenticate.js'
import type { Config } from '../../config.js'

const sessionItemSchema = z.object({
  id: z.string().uuid(),
  device_id: z.string().min(1).max(255),
  device_name: z.string().min(1).max(255),
  project_id: z.string().uuid().nullable().optional(),
  task_id: z.string().uuid().nullable().optional(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable().optional(),
  duration_sec: z.number().int().min(0),
  is_manual: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
})

const batchSchema = z.object({
  sessions: z.array(sessionItemSchema).min(1).max(100),
})

export async function sessionCreateRoutes(fastify: FastifyInstance, opts: { config: Config }) {
  const authenticate = createAuthenticateMiddleware(opts.config)

  fastify.post('/batch', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const req = request as AuthenticatedRequest
      const body = batchSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: body.error.flatten() })
      }

      const userId = req.user!.id
      const orgId = req.user!.org_id
      const sessions = body.data.sessions

      // Collect all referenced project_ids and task_ids for IDOR check
      const referencedProjectIds = [
        ...new Set(sessions.map((s) => s.project_id).filter(Boolean)),
      ] as string[]
      const referencedTaskIds = [
        ...new Set(sessions.map((s) => s.task_id).filter(Boolean)),
      ] as string[]

      // Validate projects belong to caller's org
      if (referencedProjectIds.length > 0) {
        const validProjects = await prisma.project.findMany({
          where: { id: { in: referencedProjectIds }, org_id: orgId },
          select: { id: true },
        })
        const validProjectSet = new Set(validProjects.map((p) => p.id))
        const invalid = referencedProjectIds.find((id) => !validProjectSet.has(id))
        if (invalid) {
          return reply.status(400).send({
            code: 'INVALID_PROJECT',
            message: `Project ${invalid} not found in your organization`,
          })
        }
      }

      // Validate tasks belong to caller's org and to the correct project
      if (referencedTaskIds.length > 0) {
        const validTasks = await prisma.task.findMany({
          where: { id: { in: referencedTaskIds }, org_id: orgId },
          select: { id: true, project_id: true },
        })
        const validTaskMap = new Map(validTasks.map((t) => [t.id, t.project_id]))
        for (const s of sessions) {
          if (!s.task_id) continue
          if (!validTaskMap.has(s.task_id)) {
            return reply.status(400).send({
              code: 'INVALID_TASK',
              message: `Task ${s.task_id} not found in your organization`,
            })
          }
          // Cross-validate: task must belong to the session's project
          if (s.project_id && validTaskMap.get(s.task_id) !== s.project_id) {
            return reply.status(400).send({
              code: 'TASK_PROJECT_MISMATCH',
              message: `Task ${s.task_id} does not belong to project ${s.project_id}`,
            })
          }
        }
      }

      const orgSettings = await prisma.orgSettings.findUnique({
        where: { org_id: orgId },
        select: { time_approval_required: true },
      })
      const defaultApprovalStatus = orgSettings?.time_approval_required ? 'PENDING' : 'APPROVED'

      const synced: { id: string; server_id: string }[] = []
      const errors: { id: string; reason: string }[] = []

      for (const s of sessions) {
        try {
          // Validate time range
          if (s.ended_at && s.started_at) {
            const start = new Date(s.started_at)
            const end = new Date(s.ended_at)
            if (end <= start) {
              errors.push({ id: s.id, reason: 'ended_at must be after started_at' })
              continue
            }
          }
          if (s.ended_at && s.duration_sec <= 0) {
            errors.push({
              id: s.id,
              reason: 'duration_sec must be positive for completed sessions',
            })
            continue
          }

          /**
           * Prefer update by primary id so repair/re-sync always hits the same row the
           * desktop knows about. Compound unique (user_id, device_id, started_at) can miss
           * when restarted_at parsing differs slightly, causing a failed create instead of
           * updating project/task on the existing session.
           */
          const existingById = await prisma.timeSession.findFirst({
            where: { id: s.id, user_id: userId, org_id: orgId },
            select: { id: true },
          })

          const updateData = {
            ended_at: s.ended_at ? new Date(s.ended_at) : null,
            duration_sec: s.duration_sec,
            notes: s.notes ?? null,
            device_id: s.device_id,
            device_name: s.device_name,
            ...(s.project_id != null ? { project_id: s.project_id } : {}),
            ...(s.task_id != null ? { task_id: s.task_id } : {}),
          }

          if (existingById) {
            await prisma.timeSession.update({
              where: { id: s.id },
              data: updateData,
            })
            synced.push({ id: s.id, server_id: s.id })
            continue
          }

          const session = await prisma.timeSession.upsert({
            where: {
              user_id_device_id_started_at: {
                user_id: userId,
                device_id: s.device_id,
                started_at: new Date(s.started_at),
              },
            },
            create: {
              id: s.id,
              user_id: userId,
              org_id: orgId,
              project_id: s.project_id ?? null,
              task_id: s.task_id ?? null,
              device_id: s.device_id,
              device_name: s.device_name,
              started_at: new Date(s.started_at),
              ended_at: s.ended_at ? new Date(s.ended_at) : null,
              duration_sec: s.duration_sec,
              is_manual: s.is_manual,
              notes: s.notes ?? null,
              approval_status: defaultApprovalStatus,
            },
            update: {
              ended_at: updateData.ended_at ?? undefined,
              duration_sec: updateData.duration_sec,
              notes: updateData.notes,
              device_id: updateData.device_id,
              device_name: updateData.device_name,
              ...(s.project_id != null ? { project_id: s.project_id } : {}),
              ...(s.task_id != null ? { task_id: s.task_id } : {}),
            },
          })

          synced.push({ id: s.id, server_id: session.id })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          errors.push({ id: s.id, reason: message })
        }
      }

      return { synced, errors }
    },
  })
}
