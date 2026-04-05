/**
 * BullMQ queue definitions + worker startup.
 */
import { Queue, Worker } from 'bullmq'
import type { Config } from '../config.js'

let config: Config | null = null
let emailQueue: Queue | null = null
let screenshotQueue: Queue | null = null
let integrationQueue: Queue | null = null
let budgetAlertQueue: Queue | null = null
let retentionQueue: Queue | null = null
let timeLogPushQueue: Queue | null = null
let agentMaintenanceQueue: Queue | null = null
let reportEmailQueue: Queue | null = null
let pdfExportQueue: Queue | null = null

export function initQueues(cfg: Config): void {
  config = cfg
}

function getConfig(): Config {
  if (!config) throw new Error('Queues not initialized — call initQueues(config) first')
  return config
}

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue('email', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    })
  }
  return emailQueue
}

export function getScreenshotQueue(): Queue {
  if (!screenshotQueue) {
    screenshotQueue = new Queue('screenshot-processing', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    })
  }
  return screenshotQueue
}

export function getIntegrationQueue(): Queue {
  if (!integrationQueue) {
    integrationQueue = new Queue('integration-sync', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
    })
  }
  return integrationQueue
}

export function getBudgetAlertQueue(): Queue {
  if (!budgetAlertQueue) {
    budgetAlertQueue = new Queue('budget-alert', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 2 },
    })
  }
  return budgetAlertQueue
}

export function getRetentionQueue(): Queue {
  if (!retentionQueue) {
    retentionQueue = new Queue('retention', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 2 },
    })
  }
  return retentionQueue
}

export function getTimeLogPushQueue(): Queue {
  if (!timeLogPushQueue) {
    timeLogPushQueue = new Queue('time-log-push', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    })
  }
  return timeLogPushQueue
}

export function getAgentMaintenanceQueue(): Queue {
  if (!agentMaintenanceQueue) {
    agentMaintenanceQueue = new Queue('agent-maintenance', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 2 },
    })
  }
  return agentMaintenanceQueue
}

export function getReportEmailQueue(): Queue {
  if (!reportEmailQueue) {
    reportEmailQueue = new Queue('report-emails', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    })
  }
  return reportEmailQueue
}

export function getPdfExportQueue(): Queue {
  if (!pdfExportQueue) {
    pdfExportQueue = new Queue('pdf-export', {
      connection: { url: getConfig().REDIS_URL },
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
    })
  }
  return pdfExportQueue
}

/** Register BullMQ repeatable jobs (idempotent jobIds in Redis). */
export async function scheduleRepeatableJobs(): Promise<void> {
  const retention = getRetentionQueue()
  const budget = getBudgetAlertQueue()
  const agentMaint = getAgentMaintenanceQueue()

  await retention.add(
    'retention-sweep',
    {},
    { repeat: { pattern: '0 2 * * *' }, jobId: 'retention-daily' }
  )
  await budget.add('budget-check', {}, { repeat: { pattern: '0 * * * *' }, jobId: 'budget-hourly' })
  await agentMaint.add(
    'stale-command-cleanup',
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'agent-stale-cleanup' }
  )
  await agentMaint.add(
    'offline-check',
    {},
    { repeat: { pattern: '*/2 * * * *' }, jobId: 'agent-offline-check' }
  )
  await agentMaint.add(
    'expire-offline-requests',
    {},
    { repeat: { pattern: '0 2 * * *' }, jobId: 'offline-expire-daily' }
  )
  await agentMaint.add(
    'calculate-streaks',
    {},
    { repeat: { pattern: '5 0 * * *' }, jobId: 'streak-daily' }
  )
}

/** Start all BullMQ workers. Call once during app startup. */
export async function startWorkers(cfg: Config): Promise<Worker[]> {
  const { screenshotWorker } = await import('./workers/screenshotWorker.js')
  const { retentionWorker } = await import('./workers/retentionWorker.js')
  const { integrationSyncWorker } = await import('./workers/integrationSync.js')
  const { timeLogPushWorker } = await import('./workers/timeLogPush.js')
  const { budgetAlertWorker } = await import('./workers/budgetAlert.js')
  const { emailWorker } = await import('./workers/emailWorker.js')
  const { agentMaintenanceWorker } = await import('./workers/agentMaintenanceWorker.js')
  const { reportEmailWorker } = await import('./workers/reportEmailWorker.js')
  const { pdfExportWorker } = await import('./workers/pdfExportWorker.js')

  return [
    screenshotWorker(cfg),
    retentionWorker(cfg),
    integrationSyncWorker(cfg),
    timeLogPushWorker(cfg),
    budgetAlertWorker(cfg),
    emailWorker(cfg),
    agentMaintenanceWorker(cfg),
    reportEmailWorker(cfg),
    pdfExportWorker(cfg),
  ]
}
