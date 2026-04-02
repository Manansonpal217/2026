import type { Config } from '../config.js'
import { enqueueTransactionalEmail } from '../services/email/enqueue.js'

/**
 * Enqueues a generic HTML/text email (e.g. budget alerts, session notifications).
 * Delivery runs asynchronously via the BullMQ `email` worker + Resend.
 */
export async function sendEmail(
  _config: Config,
  opts: { to: string; subject: string; text?: string; html?: string }
): Promise<void> {
  await enqueueTransactionalEmail({
    kind: 'raw',
    to: opts.to,
    subject: opts.subject,
    ...(opts.html !== undefined ? { html: opts.html } : {}),
    ...(opts.text !== undefined ? { text: opts.text } : {}),
  })
}
