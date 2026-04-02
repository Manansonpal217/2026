import {
  bodyParagraph,
  ctaButton,
  emailBaseLayout,
  escapeHtml,
  finePrint,
  infoPanel,
} from './baseLayout.js'

export type ResetPasswordParams = {
  resetLink: string
  expiresIn: string
}

/** HTML body for password reset email. */
export function resetPasswordHtml(params: ResetPasswordParams): string {
  const { resetLink, expiresIn } = params
  const inner = `
${bodyParagraph('We received a request to reset the password for your TrackSync account. If that was you, choose a new password using the secure link below.')}
${infoPanel(`<strong style="color:#312e81;">Didn&apos;t request this?</strong><br /><span style="color:#4338a3;">You can ignore this message—your password will stay the same and your account remains protected.</span>`)}
${ctaButton(resetLink, 'Reset password')}
${finePrint(`For your security, this link expires in <strong style="color:#64748b;">${escapeHtml(expiresIn)}</strong>. Never share reset links with anyone.`)}
`
  return emailBaseLayout(inner, {
    eyebrow: 'Account security',
    title: 'Reset your password',
  })
}
