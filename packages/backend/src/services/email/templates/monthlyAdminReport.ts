import { emailBaseLayout, escapeHtml } from './baseLayout.js'

export type MonthlyAdminReportParams = {
  adminName: string
  orgName: string
  monthLabel: string
  orgTotalSeconds: number
  userCount: number
  activeUserCount: number
  newUserCount: number
  integrationStatuses: { name: string; status: 'active' | 'error' | 'disconnected' }[]
  dashboardLink: string
}

function fmtHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '0m'
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function metricCard(label: string, value: string, sub?: string): string {
  return `<td style="width:50%;padding:0 6px 0 0;vertical-align:top;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 2px 0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">${escapeHtml(label)}</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.03em;">${escapeHtml(value)}</p>
        ${sub ? `<p style="margin:2px 0 0 0;font-size:11px;color:#64748b;">${escapeHtml(sub)}</p>` : ''}
      </td></tr>
    </table>
  </td>`
}

function statusPill(status: 'active' | 'error' | 'disconnected'): string {
  const config = {
    active: { bg: '#dcfce7', color: '#15803d', label: 'Active' },
    error: { bg: '#fee2e2', color: '#b91c1c', label: 'Error' },
    disconnected: { bg: '#f1f5f9', color: '#64748b', label: 'Disconnected' },
  }
  const { bg, color, label } = config[status]
  return `<span style="display:inline-block;padding:2px 8px;background:${bg};color:${color};border-radius:999px;font-size:11px;font-weight:700;">${label}</span>`
}

export function monthlyAdminReportHtml(params: MonthlyAdminReportParams): string {
  const {
    adminName,
    orgName,
    monthLabel,
    orgTotalSeconds,
    userCount,
    activeUserCount,
    newUserCount,
    integrationStatuses,
    dashboardLink,
  } = params

  const inner = `
<p style="margin:0 0 6px 0;font-size:16px;line-height:1.65;color:#475569;">Hi <strong style="color:#0f172a;">${escapeHtml(adminName)}</strong>,</p>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#64748b;">Monthly overview for <strong style="color:#334155;">${escapeHtml(orgName)}</strong> — <strong style="color:#334155;">${escapeHtml(monthLabel)}</strong>.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:4px;">
  <tr>
    ${metricCard('Org total hours', fmtHours(orgTotalSeconds), 'tracked this month')}
    ${metricCard('Total users', String(userCount), `${activeUserCount} active`)}
  </tr>
  <tr>
    ${metricCard('New users', String(newUserCount), 'joined this month')}
    ${metricCard('Avg per user', fmtHours(activeUserCount > 0 ? Math.round(orgTotalSeconds / activeUserCount) : 0), 'active users only')}
  </tr>
</table>

${
  integrationStatuses.length > 0
    ? `
<p style="margin:16px 0 4px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;">Integration sync status</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:20px;">
  ${integrationStatuses
    .map(
      (s, i) => `<tr style="${i % 2 === 0 ? '' : 'background:#fafafa;'}">
    <td style="padding:8px 10px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${escapeHtml(s.name)}</td>
    <td style="padding:8px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${statusPill(s.status)}</td>
  </tr>`
    )
    .join('')}
</table>`
    : ''
}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px 0;">
  <tr>
    <td align="left">
      <a href="${escapeHtml(dashboardLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;background:#6366f1;background-image:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">View admin dashboard &rarr;</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">Unsubscribe from admin reports in <a href="${escapeHtml(dashboardLink)}/settings" style="color:#6366f1;text-decoration:none;">account settings</a>.</p>
`

  return emailBaseLayout(inner, {
    eyebrow: 'Admin Report',
    title: 'Monthly org summary',
  })
}
