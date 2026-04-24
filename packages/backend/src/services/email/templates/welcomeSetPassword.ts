import {
  bodyParagraph,
  ctaButton,
  emailBaseLayout,
  escapeHtml,
  finePrint,
  infoPanel,
} from './baseLayout.js'

export type WelcomeSetPasswordParams = {
  /** Display name of the new account holder (e.g. org owner). */
  recipientName: string
  /** Organization or workspace display name. */
  orgName: string
  setPasswordLink: string
  expiresIn: string
}

/** HTML for first-time password setup (e.g. new org owner) — not a generic “forgot password” message. */
export function welcomeSetPasswordHtml(params: WelcomeSetPasswordParams): string {
  const { recipientName, orgName, setPasswordLink, expiresIn } = params
  const inner = `
${bodyParagraph(`Hi <strong style="color:#0f172a;">${escapeHtml(recipientName)}</strong>—your TrackSync workspace <strong style="color:#0f172a;">${escapeHtml(orgName)}</strong> is ready.`)}
${bodyParagraph('Use the secure link below to choose your password and sign in for the first time.')}
${infoPanel(`<strong style="color:#312e81;">First-time setup</strong><br /><span style="color:#4338a3;">This link is only for setting your password. After that, sign in with your email and the password you chose.</span>`)}
${ctaButton(setPasswordLink, 'Set your password')}
${finePrint(`This link expires in <strong style="color:#64748b;">${escapeHtml(expiresIn)}</strong>. If it expires, ask your TrackSync contact to resend your setup email.`)}
`
  return emailBaseLayout(inner, {
    eyebrow: 'Welcome to TrackSync',
    title: 'Set up your account',
  })
}
