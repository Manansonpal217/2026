import {
  bodyParagraph,
  emailBaseLayout,
  escapeHtml,
  finePrint,
  infoPanel,
  warningPanel,
} from './baseLayout.js'

export type PasswordChangedParams = {
  userName: string
}

/** HTML body for password change confirmation (no CTA). */
export function passwordChangedHtml(params: PasswordChangedParams): string {
  const { userName } = params
  const inner = `
${bodyParagraph(`Hi <strong style="color:#0f172a;">${escapeHtml(userName)}</strong>,`)}
${bodyParagraph('The password for your TrackSync account was <strong style="color:#0f172a;">just changed</strong>. If you made this update, you&apos;re all set—no further action needed.')}
${infoPanel(`<strong style="color:#312e81;">Security tip</strong><br /><span style="color:#4338a3;">Use a unique password and consider enabling MFA for admins when your org enables it.</span>`)}
${warningPanel(`If you <strong>did not</strong> change your password, contact us immediately at <a href="mailto:support@tracksync.dev" style="color:#991b1b;text-decoration:underline;">support@tracksync.dev</a> so we can help secure your account.`)}
${finePrint('This is an automated security message from TrackSync.')}
`
  return emailBaseLayout(inner, {
    eyebrow: 'Security update',
    title: 'Password updated',
  })
}
