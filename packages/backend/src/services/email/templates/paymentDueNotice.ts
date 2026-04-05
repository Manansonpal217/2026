import { emailBaseLayout, escapeHtml, ctaButton, infoPanel, bodyParagraph } from './baseLayout.js'

export type PaymentDueNoticeParams = {
  adminName: string
  planName: string
  amountDue: string
  dueDate: string
  billingLink: string
}

export function paymentDueNoticeHtml(params: PaymentDueNoticeParams): string {
  const { adminName, planName, amountDue, dueDate, billingLink } = params

  const inner = `
${bodyParagraph(`Hi <strong style="color:#0f172a;">${escapeHtml(adminName)}</strong>,`)}
${bodyParagraph(`A payment is coming up for your <strong style="color:#0f172a;">${escapeHtml(planName)}</strong> plan. Please ensure your payment method is up to date to avoid any interruption to your service.`)}
${infoPanel(`
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="padding:4px 0;font-size:14px;color:#3730a3;"><strong>Plan:</strong></td>
      <td style="padding:4px 0;font-size:14px;color:#3730a3;text-align:right;">${escapeHtml(planName)}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;font-size:14px;color:#3730a3;"><strong>Amount due:</strong></td>
      <td style="padding:4px 0;font-size:14px;font-weight:700;color:#312e81;text-align:right;">${escapeHtml(amountDue)}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;font-size:14px;color:#3730a3;"><strong>Due date:</strong></td>
      <td style="padding:4px 0;font-size:14px;color:#3730a3;text-align:right;">${escapeHtml(dueDate)}</td>
    </tr>
  </table>
`)}
${ctaButton(billingLink, 'Manage billing')}
<p style="margin:12px 0 0 0;font-size:13px;color:#94a3b8;">If you have questions about your invoice, reply to this email or contact <a href="mailto:support@tracksync.dev" style="color:#6366f1;text-decoration:none;font-weight:600;">support@tracksync.dev</a>.</p>
`

  return emailBaseLayout(inner, {
    eyebrow: 'Billing notice',
    title: 'Payment coming up',
  })
}
