import {
  bodyParagraph,
  ctaButton,
  emailBaseLayout,
  escapeHtml,
  finePrint,
  infoPanel,
} from './baseLayout.js'

export type InviteUserParams = {
  inviterName: string
  workspaceName: string
  inviteLink: string
  expiresIn: string
}

/** HTML body for team member invitation email. */
export function inviteUserHtml(params: InviteUserParams): string {
  const { inviterName, workspaceName, inviteLink, expiresIn } = params
  const inner = `
${bodyParagraph(`<strong style="color:#0f172a;">${escapeHtml(inviterName)}</strong> invited you to join <strong style="color:#0f172a;">${escapeHtml(workspaceName)}</strong> on TrackSync.`)}
${infoPanel(`<strong style="color:#312e81;">Why TrackSync?</strong><br /><span style="color:#4338a3;">See how your team spends time, stay aligned on projects, and ship with less guesswork—without the spreadsheet chaos.</span>`)}
${bodyParagraph('Tap the button below to accept your seat and set up your account in minutes.')}
${ctaButton(inviteLink, 'Accept invitation')}
${finePrint(`This invitation expires in <strong style="color:#64748b;">${escapeHtml(expiresIn)}</strong>. If you did not expect this email, you can safely ignore it—no account changes will be made.`)}
`
  return emailBaseLayout(inner, {
    eyebrow: "You're invited",
    title: 'Join your team on TrackSync',
  })
}
