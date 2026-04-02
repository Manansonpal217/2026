import { Resend } from 'resend'
import { inviteUserHtml } from './templates/inviteUser.js'
import { resetPasswordHtml } from './templates/resetPassword.js'
import { verifyEmailHtml } from './templates/verifyEmail.js'
import { welcomeEmailHtml } from './templates/welcomeEmail.js'
import { passwordChangedHtml } from './templates/passwordChanged.js'
import { planUpgradeHtml } from './templates/planUpgrade.js'

/** Default outbound sender: display name + support@tracksync.dev. Override with RESEND_FROM. */
function resolveFromAddress(): string {
  const raw = process.env.RESEND_FROM?.trim()
  if (raw) return raw
  return 'TrackSync <support@tracksync.dev>'
}

let resendClient: Resend | null | undefined

function getResend(): Resend | null {
  if (resendClient !== undefined) return resendClient
  const key = process.env.RESEND_API_KEY
  if (!key) {
    resendClient = null
    return null
  }
  resendClient = new Resend(key)
  return resendClient
}

export type SendEmailResult = { success: boolean; error?: string }

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Low-level send: delivers one message via Resend.
 * Requires `RESEND_API_KEY`; otherwise returns failure without throwing.
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<SendEmailResult> {
  try {
    const client = getResend()
    if (!client) {
      console.error('[email] RESEND_API_KEY missing; skipping send', {
        to: opts.to,
        subject: opts.subject,
      })
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const { error } = await client.emails.send({
      from: resolveFromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
    })

    if (error) {
      console.error('[email] Resend API error', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[email] sendEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}

/**
 * Sends team invitation email.
 */
export async function sendInviteEmail(
  to: string,
  params: {
    inviterName: string
    workspaceName: string
    inviteLink: string
    expiresIn: string
  }
): Promise<SendEmailResult> {
  try {
    const subject = `${params.inviterName} invited you to join ${params.workspaceName} on TrackSync`
    const html = inviteUserHtml(params)
    return await sendEmail({ to, subject, html })
  } catch (err) {
    console.error('[email] sendInviteEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}

/**
 * Sends password reset link email.
 */
export async function sendResetPasswordEmail(
  to: string,
  params: { resetLink: string; expiresIn: string }
): Promise<SendEmailResult> {
  try {
    const subject = 'Reset your TrackSync password'
    const html = resetPasswordHtml(params)
    return await sendEmail({ to, subject, html })
  } catch (err) {
    console.error('[email] sendResetPasswordEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}

/**
 * Sends signup email verification message.
 */
export async function sendVerifyEmail(
  to: string,
  params: { verifyLink: string; userName: string }
): Promise<SendEmailResult> {
  try {
    const subject = 'Verify your email – TrackSync'
    const html = verifyEmailHtml(params)
    return await sendEmail({ to, subject, html })
  } catch (err) {
    console.error('[email] sendVerifyEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}

/**
 * Sends welcome email after the user verifies their address.
 */
export async function sendWelcomeEmail(
  to: string,
  params: { userName: string; dashboardLink: string }
): Promise<SendEmailResult> {
  try {
    const subject = `Welcome to TrackSync, ${params.userName}! 🎉`
    const html = welcomeEmailHtml(params)
    return await sendEmail({ to, subject, html })
  } catch (err) {
    console.error('[email] sendWelcomeEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}

/**
 * Notifies the user that their password was changed.
 */
export async function sendPasswordChangedEmail(
  to: string,
  params: { userName: string }
): Promise<SendEmailResult> {
  try {
    const subject = 'Your TrackSync password was changed'
    const html = passwordChangedHtml(params)
    return await sendEmail({ to, subject, html })
  } catch (err) {
    console.error('[email] sendPasswordChangedEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}

/**
 * Confirms a plan / subscription upgrade.
 * TODO: Call from billing (e.g. Stripe webhook) or admin plan-change flow when implemented.
 */
export async function sendPlanUpgradeEmail(
  to: string,
  params: { userName: string; planName: string; billingDate: string; dashboardLink: string }
): Promise<SendEmailResult> {
  try {
    const subject = `You're now on the ${params.planName} plan 🚀`
    const html = planUpgradeHtml(params)
    return await sendEmail({ to, subject, html })
  } catch (err) {
    console.error('[email] sendPlanUpgradeEmail failed', err)
    return { success: false, error: toErrorMessage(err) }
  }
}
