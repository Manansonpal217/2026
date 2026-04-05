import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../db/prisma.js'
import type { Config } from '../../config.js'
import { OVERRIDABLE_KEYS, type OverridableKey, resolveFeature } from '../../lib/settings.js'
import {
  createVerifyAgentMiddleware,
  type AgentAuthenticatedRequest,
} from '../../middleware/verifyAgentToken.js'
const ackBodySchema = z.object({
  status: z.enum(['success', 'failed']),
  error: z.string().max(4000).optional(),
})

const heartbeatBodySchema = z.object({
  agentVersion: z.string().max(100).optional(),
  status: z.enum(['online', 'offline']).optional(),
  lastSyncAt: z.string().datetime({ offset: true }).optional(),
  lastSyncCount: z.number().int().min(0).optional(),
})

const jiraIssueIngestSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  assignee_email: z.string().max(320).optional().nullable(),
  priority: z.string().optional().nullable(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
  labels: z.array(z.string()).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
})

const ingestJiraBodySchema = z.object({
  issues: z.array(jiraIssueIngestSchema).min(1).max(500),
})

export async function agentRoutes(fastify: FastifyInstance, _opts: { config: Config }) {
  const verifyAgent = createVerifyAgentMiddleware()

  fastify.addHook('onRequest', async (request, reply) => {
    await verifyAgent(request, reply)
    if (reply.sent) return
  })

  fastify.get('/commands', async (request, _reply) => {
    const orgId = (request as AgentAuthenticatedRequest).agentOrgId!
    const commands = await prisma.$transaction(async (tx) => {
      const pending = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "AgentCommand"
        WHERE org_id = ${orgId} AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `

      if (pending.length === 0) return []

      const ids = pending.map((r) => r.id)
      await tx.agentCommand.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'executing',
          locked_at: new Date(),
          attempts: { increment: 1 },
        },
      })

      return tx.agentCommand.findMany({
        where: { id: { in: ids } },
        orderBy: { created_at: 'asc' },
      })
    })

    return { commands }
  })

  fastify.post<{ Params: { id: string } }>('/commands/:id/ack', async (request, reply) => {
    const orgId = (request as AgentAuthenticatedRequest).agentOrgId!
    const { id } = request.params
    const parsed = ackBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
    }

    const command = await prisma.agentCommand.findFirst({
      where: { id, org_id: orgId },
    })
    if (!command) {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Command not found' })
    }

    const { status, error } = parsed.data
    const now = new Date()

    if (status === 'success') {
      await prisma.agentCommand.update({
        where: { id: command.id },
        data: {
          status: 'success',
          error: null,
          locked_at: null,
          completed_at: now,
        },
      })
      return { ok: true, status: 'success' }
    }

    // failed
    const attemptsAfterClaim = command.attempts
    const finalStatus = attemptsAfterClaim >= 3 ? 'permanently_failed' : 'pending'

    await prisma.agentCommand.update({
      where: { id: command.id },
      data: {
        status: finalStatus,
        error: error ?? null,
        locked_at: null,
        ...(finalStatus === 'permanently_failed' ? { completed_at: now } : { completed_at: null }),
      },
    })

    return { ok: true, status: finalStatus }
  })

  fastify.post('/heartbeat', async (request, reply) => {
    const orgId = (request as AgentAuthenticatedRequest).agentOrgId!
    const parsed = heartbeatBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
    }
    const b = parsed.data
    const lastSyncAt = b.lastSyncAt ? new Date(b.lastSyncAt) : undefined

    const row = await prisma.agentHeartbeat.upsert({
      where: { org_id: orgId },
      create: {
        org_id: orgId,
        agent_version: b.agentVersion ?? null,
        status: b.status ?? 'online',
        last_seen_at: new Date(),
        last_sync_at: lastSyncAt ?? null,
        last_sync_count: b.lastSyncCount ?? null,
      },
      update: {
        agent_version: b.agentVersion !== undefined ? b.agentVersion : undefined,
        status: b.status ?? 'online',
        last_seen_at: new Date(),
        ...(lastSyncAt !== undefined ? { last_sync_at: lastSyncAt } : {}),
        ...(b.lastSyncCount !== undefined ? { last_sync_count: b.lastSyncCount } : {}),
      },
    })

    return { heartbeat: row }
  })

  fastify.post('/ingest/jira', async (request, reply) => {
    const orgId = (request as AgentAuthenticatedRequest).agentOrgId!
    const parsed = ingestJiraBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() })
    }

    const now = new Date()
    for (const issue of parsed.data.issues) {
      const rawPayload = (issue.raw ?? issue) as object
      await prisma.jiraIssue.upsert({
        where: {
          org_id_jira_id: { org_id: orgId, jira_id: issue.id },
        },
        create: {
          org_id: orgId,
          jira_id: issue.id,
          key: issue.key,
          summary: issue.summary ?? null,
          status: issue.status ?? null,
          assignee_email: issue.assignee_email ?? null,
          priority: issue.priority ?? null,
          due_date: issue.due_date ? new Date(issue.due_date) : null,
          labels: issue.labels ?? [],
          raw_payload: rawPayload as object,
          synced_at: now,
        },
        update: {
          key: issue.key,
          summary: issue.summary ?? null,
          status: issue.status ?? null,
          assignee_email: issue.assignee_email ?? null,
          priority: issue.priority ?? null,
          due_date: issue.due_date ? new Date(issue.due_date) : null,
          labels: issue.labels ?? [],
          raw_payload: rawPayload as object,
          synced_at: now,
        },
      })
    }

    return { ingested: parsed.data.issues.length }
  })

  fastify.get('/config', async (request, _reply) => {
    const orgId = (request as AgentAuthenticatedRequest).agentOrgId!
    const settings = await prisma.orgSettings.findUnique({
      where: { org_id: orgId },
    })

    const jiraProjects = (settings?.jira_projects as unknown) ?? []
    const jiraIssueTypes = (settings?.jira_issue_types as unknown) ?? []
    const jiraStatuses = (settings?.jira_statuses as unknown) ?? []

    const featureKeys = Object.keys(OVERRIDABLE_KEYS) as OverridableKey[]
    const featureEntries = await Promise.all(
      featureKeys.map(async (key) => {
        const val = await resolveFeature(orgId, '', key)
        return [key, val] as const
      })
    )
    const features: Record<string, string> = {}
    for (const [k, v] of featureEntries) features[k] = v

    return {
      sync: {
        pollIntervalMinutes: 5,
        projects: Array.isArray(jiraProjects) ? jiraProjects : [],
        issueTypes: Array.isArray(jiraIssueTypes) ? jiraIssueTypes : [],
        statuses: Array.isArray(jiraStatuses) ? jiraStatuses : [],
        fields: ['summary', 'status', 'assignee', 'priority', 'duedate', 'labels'],
        timeLogging: {
          method: settings?.jira_time_logging_method ?? 'jira_worklog',
        },
      },
      features,
    }
  })
}
