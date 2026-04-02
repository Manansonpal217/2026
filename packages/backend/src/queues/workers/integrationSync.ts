import { Worker } from 'bullmq'
import type { Config } from '../../config.js'

export interface IntegrationSyncJobData {
  integrationId: string
  orgId: string
}

export function integrationSyncWorker(config: Config): Worker<IntegrationSyncJobData> {
  return new Worker<IntegrationSyncJobData>(
    'integration-sync',
    async (job) => {
      const { integrationId, orgId } = job.data

      const { prisma } = await import('../../db/prisma.js')
      const { decryptAuthData } = await import('../../lib/integrations/kms.js')
      const { getAdapter } = await import('../../lib/integrations/registry.js')
      const { getBreaker } = await import('../../lib/integrations/circuitBreaker.js')

      const integration = await prisma.integration.findFirst({
        where: { id: integrationId, org_id: orgId, status: { not: 'disconnected' } },
      })

      if (!integration) {
        return { skipped: true, reason: 'Integration not found or disconnected' }
      }

      let adapter
      try {
        adapter = getAdapter(integration.type)
      } catch {
        await prisma.integration.update({
          where: { id: integrationId },
          data: { status: 'error' },
        })
        throw new Error(`Unknown integration type: ${integration.type}`)
      }

      // Decrypt tokens
      let auth = await decryptAuthData(integration.auth_data, config)

      // Refresh if expired
      const expiresAt = auth.expires_at as number | undefined
      if (expiresAt && expiresAt < Date.now() / 1000 + 60) {
        const breaker = getBreaker(`${integration.type}-refresh`, () => adapter.refreshTokens(auth))
        auth = (await breaker.fire(auth)) as typeof auth
        const { encryptAuthData } = await import('../../lib/integrations/kms.js')
        const newBlob = await encryptAuthData(auth, config)
        await prisma.integration.update({
          where: { id: integrationId },
          data: { auth_data: newBlob },
        })
      }

      const config_ = integration.config as Record<string, unknown>
      let syncedProjects = 0
      let syncedTasks = 0

      try {
        // Fetch + upsert projects
        const breaker = getBreaker(`${integration.type}-projects-${integrationId}`, () =>
          adapter.fetchProjects(auth, config_)
        )
        const projects = (await breaker.fire(auth, config_)) as Awaited<
          ReturnType<typeof adapter.fetchProjects>
        >

        for (const extProject of projects) {
          await prisma.project.upsert({
            where: {
              // Use a generated unique key based on external_id + org (fake unique field combo)
              id: `ext-${integration.type}-${extProject.id}`,
            },
            create: {
              id: `ext-${integration.type}-${extProject.id}`,
              org_id: orgId,
              name: extProject.name,
              color: extProject.color ?? '#6366f1',
            },
            update: { name: extProject.name },
          })
          syncedProjects++

          // Fetch + upsert tasks for this project
          try {
            const taskBreaker = getBreaker(`${integration.type}-tasks-${integrationId}`, () =>
              adapter.fetchTasks(auth, extProject.id)
            )
            const tasks = (await taskBreaker.fire(auth, extProject.id)) as Awaited<
              ReturnType<typeof adapter.fetchTasks>
            >

            for (const extTask of tasks) {
              const projectId = `ext-${integration.type}-${extProject.id}`
              let assigneeUserId: string | null = null
              if (extTask.assigneeEmail) {
                const user = await prisma.user.findFirst({
                  where: {
                    org_id: orgId,
                    email: { equals: extTask.assigneeEmail, mode: 'insensitive' },
                  },
                  select: { id: true },
                })
                assigneeUserId = user?.id ?? null
              }
              await prisma.task.upsert({
                where: { id: `ext-task-${integration.type}-${extTask.id}` },
                create: {
                  id: `ext-task-${integration.type}-${extTask.id}`,
                  project_id: projectId,
                  org_id: orgId,
                  name: extTask.name,
                  status: extTask.status === 'closed' ? 'closed' : 'open',
                  external_id: `${integration.type}:${extTask.id}`,
                  assignee_user_id: assigneeUserId,
                },
                update: {
                  name: extTask.name,
                  status: extTask.status === 'closed' ? 'closed' : 'open',
                  assignee_user_id: assigneeUserId,
                },
              })
              syncedTasks++
            }
          } catch {
            // Non-fatal: continue with other projects
          }
        }

        await prisma.integration.update({
          where: { id: integrationId },
          data: { status: 'active', last_sync_at: new Date() },
        })
      } catch (err) {
        await prisma.integration.update({
          where: { id: integrationId },
          data: { status: 'error' },
        })
        throw err
      }

      return { syncedProjects, syncedTasks }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 2,
    }
  )
}
