import {
  bodyParagraph,
  ctaButton,
  emailBaseLayout,
  escapeHtml,
  finePrint,
  infoPanel,
  numberedSteps,
} from './baseLayout.js'

export type WelcomeEmailParams = {
  userName: string
  dashboardLink: string
}

/** HTML body for post-verification welcome email. */
export function welcomeEmailHtml(params: WelcomeEmailParams): string {
  const { userName, dashboardLink } = params
  const inner = `
${bodyParagraph(`Hi <strong style="color:#0f172a;">${escapeHtml(userName)}</strong>—we&apos;re glad you&apos;re here. You&apos;re ready to explore everything TrackSync can do for your team.`)}
${infoPanel(`<strong style="color:#312e81;">Your 3-step start</strong><br /><span style="color:#4338a3;">Follow these quick steps to get value on day one.</span>`)}
${numberedSteps([
  'Log in and open your dashboard to see your workspace at a glance.',
  'Invite teammates or fine-tune settings so tracking matches how you work.',
  'Install the desktop app to capture time and activity effortlessly.',
])}
${ctaButton(dashboardLink, 'Open your dashboard')}
${finePrint('Questions? Reply to this email or write to <a href="mailto:support@tracksync.dev" style="color:#6366f1;font-weight:600;text-decoration:none;">support@tracksync.dev</a>.')}
`
  return emailBaseLayout(inner, {
    eyebrow: "You're in",
    title: 'Welcome to TrackSync',
  })
}
