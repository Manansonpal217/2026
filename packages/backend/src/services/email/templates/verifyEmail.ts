import {
  bodyParagraph,
  ctaButton,
  emailBaseLayout,
  escapeHtml,
  finePrint,
  infoPanel,
} from './baseLayout.js'

export type VerifyEmailParams = {
  verifyLink: string
  userName: string
}

/** HTML body for signup email verification. */
export function verifyEmailHtml(params: VerifyEmailParams): string {
  const { verifyLink, userName } = params
  const inner = `
${bodyParagraph(`Hi <strong style="color:#0f172a;">${escapeHtml(userName)}</strong>—welcome aboard. One quick step unlocks your workspace.`)}
${infoPanel(`<strong style="color:#312e81;">Verify your email</strong><br /><span style="color:#4338a3;">Confirming your address helps us keep your organization secure and ensures you receive important product updates.</span>`)}
${ctaButton(verifyLink, 'Verify email address')}
${finePrint(`This link expires in <strong style="color:#64748b;">24 hours</strong>. If you did not create a TrackSync account, you can ignore this email.`)}
`
  return emailBaseLayout(inner, {
    eyebrow: 'Almost there',
    title: 'Confirm your email',
  })
}
