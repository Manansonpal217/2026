import nodemailer from 'nodemailer'
import type { Config } from '../config.js'

function createTransporter(config: Config) {
  if (config.NODE_ENV === 'production' && config.SMTP_USER) {
    return nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    })
  }

  // Development: log to console instead of sending
  return nodemailer.createTransport({ jsonTransport: true })
}

async function sendMail(
  config: Config,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const transporter = createTransporter(config)
  const info = await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    html,
  })

  if (config.NODE_ENV !== 'production') {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`)
    console.log(`[EMAIL] ${JSON.stringify(info.messageId ?? info)}`)
  }
}

export async function sendEmail(
  config: Config,
  opts: { to: string; subject: string; text?: string; html?: string },
): Promise<void> {
  const transporter = createTransporter(config)
  const info = await transporter.sendMail({
    from: config.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    ...(opts.html && { html: opts.html }),
    ...(opts.text && { text: opts.text }),
  })
  if (config.NODE_ENV !== 'production') {
    console.log(`[EMAIL] To: ${opts.to} | Subject: ${opts.subject}`)
    console.log(`[EMAIL] ${JSON.stringify(info.messageId ?? info)}`)
  }
}

export async function sendVerificationEmail(
  config: Config,
  to: string,
  token: string
): Promise<void> {
  const link = `${config.APP_URL}/auth/verify-email?token=${token}`
  await sendMail(
    config,
    to,
    'Verify your TrackSync email',
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Welcome to TrackSync</h2>
      <p>Click the button below to verify your email address.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
        Verify Email
      </a>
      <p style="margin-top:16px;color:#6b7280;font-size:13px">
        This link expires in 24 hours. If you did not create a TrackSync account, you can ignore this email.
      </p>
    </div>
    `
  )
}

export async function sendInviteEmail(
  config: Config,
  to: string,
  inviteToken: string,
  orgName: string,
  inviterName: string
): Promise<void> {
  const link = `${config.APP_URL}/auth/invite/${inviteToken}`
  await sendMail(
    config,
    to,
    `You've been invited to join ${orgName} on TrackSync`,
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>You're invited!</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on TrackSync.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
        Accept Invitation
      </a>
      <p style="margin-top:16px;color:#6b7280;font-size:13px">
        This invite expires in 7 days. If you did not expect this invitation, you can ignore this email.
      </p>
    </div>
    `
  )
}
