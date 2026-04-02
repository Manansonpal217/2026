import { Worker } from 'bullmq'
import type { Config } from '../../config.js'

export interface TimeLogPushJobData {
  sessionId: string
  orgId: string
}

export function timeLogPushWorker(config: Config): Worker<TimeLogPushJobData> {
  return new Worker<TimeLogPushJobData>(
    'time-log-push',
    async (job) => {
      const { sessionId, orgId } = job.data

      const { prisma } = await import('../../db/prisma.js')
      const { getAdapter } = await import('../../lib/integrations/registry.js')
      const { decryptAuthData } = await import('../../lib/integrations/kms.js')
      const { getBreaker } = await import('../../lib/integrations/circuitBreaker.js')

      const session = await prisma.timeSession.findFirst({
        where: { id: sessionId, org_id: orgId },
        include: { task: true, project: true, user: true },
      })

      if (!session || !session.task?.external_id) {
        return { skipped: true, reason: 'No task with external_id found' }
      }

      // Determine integration type from external_id prefix (e.g., "jira:10001")
      const [integrationType] = session.task.external_id.split(':')
      if (!integrationType) {
        return { skipped: true, reason: 'Cannot determine integration type from external_id' }
      }

      const integration = await prisma.integration.findFirst({
        where: { org_id: orgId, type: integrationType, status: 'active' },
      })

      if (!integration) {
        return { skipped: true, reason: 'No active integration found' }
      }

      let adapter
      try {
        adapter = getAdapter(integrationType)
      } catch {
        return { skipped: true, reason: 'Adapter not available' }
      }
      if (!adapter?.pushTimeEntry) {
        return { skipped: true, reason: 'Adapter does not support time push' }
      }

      try {
        const auth = await decryptAuthData(integration.auth_data, config)
        const entry = {
          sessionId: session.id,
          taskExternalId: session.task!.external_id!,
          durationSec: session.duration_sec,
          startedAt: session.started_at.toISOString(),
          notes: session.notes ?? '',
          userName: session.user.name,
        }
        const breaker = getBreaker(`${integrationType}-timepush`, () =>
          adapter.pushTimeEntry!(auth, entry)
        )
        await breaker.fire(auth, entry)
        return { pushed: true }
      } catch (err) {
        // Fail-open: log but don't fail the job fatally
        console.warn(`[timeLogPush] Circuit breaker or push error: ${err}`)
        return { pushed: false, error: String(err) }
      }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 5,
    }
  )
}
