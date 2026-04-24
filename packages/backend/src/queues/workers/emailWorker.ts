import { Worker, type Job } from 'bullmq'
import type { Config } from '../../config.js'
import type { TransactionalEmailJob } from '../../services/email/enqueue.js'
import {
  sendEmail,
  sendInviteEmail,
  sendPasswordChangedEmail,
  sendPlanUpgradeEmail,
  sendResetPasswordEmail,
  sendVerifyEmail,
  sendWelcomeEmail,
  sendWelcomeSetPasswordEmail,
} from '../../services/email/emailService.js'

function normalizeAppUrl(appUrl: string): string {
  return appUrl.replace(/\/$/, '')
}

function simpleTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:sans-serif;line-height:1.5;">${escaped.replace(/\n/g, '<br/>')}</body></html>`
}

function assertSent(result: { success: boolean; error?: string }, context: string): void {
  if (result.success) return
  // Missing API key is not retryable; avoid exhausting BullMQ attempts in local dev.
  if (result.error === 'RESEND_API_KEY not configured') {
    console.warn(`[emailWorker] ${context}: skipped (${result.error})`)
    return
  }
  throw new Error(`${context}: ${result.error ?? 'unknown error'}`)
}

export function emailWorker(config: Config): Worker {
  return new Worker(
    'email',
    async (job: Job<TransactionalEmailJob>) => {
      const d = job.data

      switch (d.kind) {
        case 'verify': {
          const verifyLink = `${normalizeAppUrl(d.appUrl)}/auth/verify-email?token=${encodeURIComponent(d.token)}`
          assertSent(
            await sendVerifyEmail(d.to, { verifyLink, userName: d.userName }),
            'sendVerifyEmail'
          )
          break
        }
        case 'welcome': {
          const dashboardLink = `${normalizeAppUrl(d.appUrl)}/myhome`
          assertSent(
            await sendWelcomeEmail(d.to, { userName: d.userName, dashboardLink }),
            'sendWelcomeEmail'
          )
          break
        }
        case 'reset': {
          const resetLink = `${normalizeAppUrl(d.appUrl)}/reset-password?token=${encodeURIComponent(d.token)}`
          assertSent(
            await sendResetPasswordEmail(d.to, { resetLink, expiresIn: '1 hour' }),
            'sendResetPasswordEmail'
          )
          break
        }
        case 'welcomeSetPassword': {
          const setPasswordLink = `${normalizeAppUrl(d.appUrl)}/reset-password?token=${encodeURIComponent(d.token)}`
          assertSent(
            await sendWelcomeSetPasswordEmail(d.to, {
              recipientName: d.recipientName,
              orgName: d.orgName,
              setPasswordLink,
              expiresIn: '1 hour',
            }),
            'sendWelcomeSetPasswordEmail'
          )
          break
        }
        case 'invite': {
          const inviteLink = `${normalizeAppUrl(d.appUrl)}/auth/invite/${encodeURIComponent(d.inviteToken)}`
          assertSent(
            await sendInviteEmail(d.to, {
              inviterName: d.inviterName,
              workspaceName: d.workspaceName,
              inviteLink,
              expiresIn: '7 days',
            }),
            'sendInviteEmail'
          )
          break
        }
        case 'passwordChanged': {
          assertSent(
            await sendPasswordChangedEmail(d.to, { userName: d.userName }),
            'sendPasswordChangedEmail'
          )
          break
        }
        case 'planUpgrade': {
          const dashboardLink = `${normalizeAppUrl(d.appUrl)}/myhome`
          assertSent(
            await sendPlanUpgradeEmail(d.to, {
              userName: d.userName,
              planName: d.planName,
              billingDate: d.billingDate,
              dashboardLink,
            }),
            'sendPlanUpgradeEmail'
          )
          break
        }
        case 'raw': {
          const html = d.html ?? (d.text ? simpleTextToHtml(d.text) : '<p>(no body)</p>')
          assertSent(
            await sendEmail({
              to: d.to,
              subject: d.subject,
              html,
              ...(d.text ? { text: d.text } : {}),
            }),
            'sendEmail(raw)'
          )
          break
        }
      }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 5,
    }
  )
}
