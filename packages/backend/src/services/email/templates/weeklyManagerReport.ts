import { emailBaseLayout, escapeHtml } from './baseLayout.js'

export type WeeklyManagerReportParams = {
  managerName: string
  orgName: string
  dateRange: string
  teamTotalSeconds: number
  perUserBreakdown: { name: string; seconds: number }[]
  topPerformerName: string | null
  offlineTimeUsedSeconds: number
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

export function weeklyManagerReportHtml(params: WeeklyManagerReportParams): string {
  const {
    managerName,
    orgName,
    dateRange,
    teamTotalSeconds,
    perUserBreakdown,
    topPerformerName,
    offlineTimeUsedSeconds,
    dashboardLink,
  } = params

  const sorted = [...perUserBreakdown].sort((a, b) => b.seconds - a.seconds)

  const inner = `
<p style="margin:0 0 6px 0;font-size:16px;line-height:1.65;color:#475569;">Hi <strong style="color:#0f172a;">${escapeHtml(managerName)}</strong>,</p>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#64748b;">Team summary for <strong style="color:#334155;">${escapeHtml(orgName)}</strong> — <strong style="color:#334155;">${escapeHtml(dateRange)}</strong>.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:4px;">
  <tr>
    ${metricCard('Team total', fmtHours(teamTotalSeconds), `${perUserBreakdown.length} team member${perUserBreakdown.length !== 1 ? 's' : ''}`)}
    ${metricCard('Top performer', topPerformerName ?? '–', topPerformerName ? 'most hours this week' : 'no sessions logged')}
  </tr>
  <tr>
    ${metricCard('Avg per person', fmtHours(perUserBreakdown.length > 0 ? Math.round(teamTotalSeconds / perUserBreakdown.length) : 0), 'hours tracked')}
    ${metricCard('Offline time used', fmtHours(offlineTimeUsedSeconds), 'approved this week')}
  </tr>
</table>

<p style="margin:16px 0 4px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;">Per-member breakdown</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:20px;">
  <tr style="background:#f8fafc;">
    <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Member</th>
    <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:#64748b;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Hours</th>
  </tr>
  ${sorted
    .map(
      (u, i) => `<tr style="${i % 2 === 0 ? '' : 'background:#fafafa;'}">
    <td style="padding:8px 10px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${escapeHtml(u.name)}</td>
    <td style="padding:8px 10px;font-size:13px;font-weight:600;color:${u.seconds > 0 ? '#0f172a' : '#cbd5e1'};text-align:right;border-bottom:1px solid #f1f5f9;">${fmtHours(u.seconds)}</td>
  </tr>`
    )
    .join('')}
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px 0;">
  <tr>
    <td align="left">
      <a href="${escapeHtml(dashboardLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;background:#6366f1;background-image:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">View team dashboard &rarr;</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">Manage notification preferences in <a href="${escapeHtml(dashboardLink)}/settings" style="color:#6366f1;text-decoration:none;">account settings</a>.</p>
`

  return emailBaseLayout(inner, {
    eyebrow: 'Manager Report',
    title: 'Team weekly summary',
  })
}
