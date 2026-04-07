/**
 * Scheduled report email jobs (BullMQ payload + handler stub).
 * Cron / repeatable triggers are not wired yet — enqueue via getScheduledReportQueue().
 */
import type { Config } from '../config.js'

export type ScheduledReportFormat = 'csv' | 'pdf'

export interface ScheduledReportJobData {
  orgId: string
  reportType: string
  params: Record<string, unknown>
  recipientEmails: string[]
  format: ScheduledReportFormat
}

const FROM_ADDRESS = 'support@tracksync.dev'

/**
 * Stub: load report data for org, export to CSV/PDF, email recipients via Resend.
 * Implement when scheduled delivery is enabled.
 */
export async function processScheduledReportJob(
  data: ScheduledReportJobData,
  _config: Config
): Promise<{ ok: true; message: string }> {
  void _config
  // Future: resolve report handler by reportType, stream CSV or enqueue PDF job, then:
  // await sendEmail({ from: FROM_ADDRESS, to: data.recipientEmails, ... })
  return {
    ok: true,
    message: `scheduled report stub: ${data.reportType} for org ${data.orgId} (${data.format}) — recipients ${data.recipientEmails.join(', ')} — from ${FROM_ADDRESS}`,
  }
}
