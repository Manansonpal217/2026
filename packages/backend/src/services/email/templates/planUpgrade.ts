import {
  bodyParagraph,
  ctaButton,
  emailBaseLayout,
  escapeHtml,
  featureCheckList,
  finePrint,
  infoPanel,
} from './baseLayout.js'

export type PlanUpgradeParams = {
  userName: string
  planName: string
  billingDate: string
  dashboardLink: string
}

/** HTML body for plan upgrade confirmation. */
export function planUpgradeHtml(params: PlanUpgradeParams): string {
  const { userName, planName, billingDate, dashboardLink } = params
  const inner = `
${bodyParagraph(`Hi <strong style="color:#0f172a;">${escapeHtml(userName)}</strong>—thank you for upgrading. Your workspace is now on the <strong style="color:#6366f1;">${escapeHtml(planName)}</strong> plan.`)}
${infoPanel(`<strong style="color:#312e81;">Next billing date</strong><br /><span style="color:#4338a3;font-size:16px;font-weight:700;">${escapeHtml(billingDate)}</span>`)}
${bodyParagraph('<strong style="color:#0f172a;">Included with your plan</strong>')}
${featureCheckList([
  'Full access to TrackSync features for your tier',
  'Team time tracking, activity insights, and reporting',
  'Priority email support where applicable',
])}
${ctaButton(dashboardLink, 'View dashboard')}
${finePrint('Billing questions? Reach us at <a href="mailto:support@tracksync.dev" style="color:#6366f1;font-weight:600;text-decoration:none;">support@tracksync.dev</a>.')}
`
  return emailBaseLayout(inner, {
    eyebrow: 'Subscription',
    title: `You're on the ${planName} plan`,
  })
}
