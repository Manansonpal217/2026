#!/usr/bin/env npx tsx
/**
 * Sends every transactional template once via Resend (smoke test).
 * Run from packages/backend: pnpm run email:test-all [to@email.com]
 * Requires: RESEND_API_KEY in .env or .env.local
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function loadEnvFile(name: string): void {
  const p = join(process.cwd(), name)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

async function main(): Promise<void> {
  loadEnvFile('.env')
  loadEnvFile('.env.local')

  const to = process.argv[2] ?? 'manansonpal217@gmail.com'
  const base = (process.env.APP_URL ?? 'http://localhost:3002').replace(/\/$/, '')

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error('Missing RESEND_API_KEY. Set it in .env or .env.local, then retry.')
    process.exit(1)
  }

  const {
    sendEmail,
    sendInviteEmail,
    sendResetPasswordEmail,
    sendVerifyEmail,
    sendWelcomeEmail,
    sendWelcomeSetPasswordEmail,
    sendPasswordChangedEmail,
    sendPlanUpgradeEmail,
  } = await import('../src/services/email/emailService.js')

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const steps: Array<{ label: string; run: () => Promise<{ success: boolean; error?: string }> }> =
    [
      {
        label: 'invite',
        run: () =>
          sendInviteEmail(to, {
            inviterName: 'Alex (test)',
            workspaceName: 'Acme Corp',
            inviteLink: `${base}/auth/invite/test-invite-token`,
            expiresIn: '7 days',
          }),
      },
      {
        label: 'reset password',
        run: () =>
          sendResetPasswordEmail(to, {
            resetLink: `${base}/reset-password?token=test-reset-token`,
            expiresIn: '1 hour',
          }),
      },
      {
        label: 'welcome set password (new org owner)',
        run: () =>
          sendWelcomeSetPasswordEmail(to, {
            recipientName: 'Test Owner',
            orgName: 'Acme Corp',
            setPasswordLink: `${base}/reset-password?token=test-onboarding-token`,
            expiresIn: '1 hour',
          }),
      },
      {
        label: 'verify email',
        run: () =>
          sendVerifyEmail(to, {
            verifyLink: `${base}/auth/verify-email?token=test-verify-token`,
            userName: 'Test User',
          }),
      },
      {
        label: 'welcome',
        run: () =>
          sendWelcomeEmail(to, {
            userName: 'Test User',
            dashboardLink: `${base}/myhome`,
          }),
      },
      {
        label: 'password changed',
        run: () => sendPasswordChangedEmail(to, { userName: 'Test User' }),
      },
      {
        label: 'plan upgrade',
        run: () =>
          sendPlanUpgradeEmail(to, {
            userName: 'Test User',
            planName: 'Pro',
            billingDate: 'April 15, 2026',
            dashboardLink: `${base}/myhome`,
          }),
      },
      {
        label: 'raw (session-style)',
        run: () =>
          sendEmail({
            to,
            subject: '[TrackSync] Test — generic notification',
            text: 'This is a plain-text test email (same path as budget/session notifications).',
          }),
      },
    ]

  console.log(`Sending ${steps.length} test emails to ${to} (APP_URL=${base})...\n`)

  for (const { label, run } of steps) {
    const result = await run()
    console.log(result.success ? `  OK  ${label}` : `  FAIL ${label}: ${result.error ?? 'unknown'}`)
    await delay(600)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
