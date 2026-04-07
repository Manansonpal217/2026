/**
 * Worker for `scheduled-report` queue — processes ScheduledReportJobData payloads.
 */
import { Worker, type Job } from 'bullmq'
import type { Config } from '../../config.js'
import {
  processScheduledReportJob,
  type ScheduledReportJobData,
} from '../../jobs/scheduledReport.job.js'

export function scheduledReportWorker(cfg: Config): Worker<ScheduledReportJobData> {
  return new Worker<ScheduledReportJobData>(
    'scheduled-report',
    async (job: Job<ScheduledReportJobData>) => {
      return processScheduledReportJob(job.data, cfg)
    },
    {
      connection: { url: cfg.REDIS_URL },
      concurrency: 1,
    }
  )
}
