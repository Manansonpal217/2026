import { getEmailQueue } from '../../queues/index.js'

/** Payload for the BullMQ `email` queue (job name `transactional`). */
export type TransactionalEmailJob =
  | {
      kind: 'verify'
      to: string
      appUrl: string
      userName: string
      token: string
    }
  | {
      kind: 'welcome'
      to: string
      appUrl: string
      userName: string
    }
  | {
      kind: 'reset'
      to: string
      appUrl: string
      token: string
    }
  | {
      kind: 'invite'
      to: string
      appUrl: string
      inviterName: string
      workspaceName: string
      inviteToken: string
    }
  | {
      kind: 'passwordChanged'
      to: string
      userName: string
    }
  | {
      kind: 'planUpgrade'
      to: string
      appUrl: string
      userName: string
      planName: string
      billingDate: string
    }
  | {
      kind: 'raw'
      to: string
      subject: string
      html?: string
      text?: string
    }

/**
 * Enqueues a transactional or raw HTML/text email for async delivery.
 */
export async function enqueueTransactionalEmail(job: TransactionalEmailJob): Promise<void> {
  const queue = getEmailQueue()
  await queue.add('transactional', job)
}
