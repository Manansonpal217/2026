import { Worker, type Job } from 'bullmq'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'

const STALE_EXECUTING_MS = 5 * 60 * 1000
const OFFLINE_HEARTBEAT_MS = 2 * 60 * 1000

export function agentMaintenanceWorker(config: Config): Worker {
  return new Worker(
    'agent-maintenance',
    async (job: Job) => {
      if (job.name === 'stale-command-cleanup') {
        const cutoff = new Date(Date.now() - STALE_EXECUTING_MS)
        const result = await prisma.agentCommand.updateMany({
          where: {
            status: 'executing',
            locked_at: { lt: cutoff },
          },
          data: { status: 'pending', locked_at: null },
        })
        return { reset: result.count }
      }

      if (job.name === 'offline-check') {
        const cutoff = new Date(Date.now() - OFFLINE_HEARTBEAT_MS)
        const result = await prisma.agentHeartbeat.updateMany({
          where: {
            status: 'online',
            last_seen_at: { lt: cutoff },
          },
          data: { status: 'offline' },
        })
        return { marked_offline: result.count }
      }

      return { skipped: true, reason: `unknown job name: ${job.name}` }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 1,
    }
  )
}
