import { emailBaseLayout, escapeHtml } from './baseLayout.js'

export type WeeklyUserReportParams = {
  userName: string
  dateRange: string
  totalSeconds: number
  currentStreak: number
  topProject: string | null
  dailyBreakdown: { date: string; seconds: number }[]
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
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 2px 0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">${escapeHtml(label)}</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.03em;">${escapeHtml(value)}</p>
          ${sub ? `<p style="margin:2px 0 0 0;font-size:11px;color:#64748b;">${escapeHtml(sub)}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>`
}

function svgBarChart(days: { date: string; seconds: number }[]): string {
  const barW = 30
  const gap = 10
  const chartH = 56
  const labelH = 16
  const totalW = 7 * barW + 6 * gap
  const maxSec = Math.max(...days.map((d) => d.seconds), 1)

  const bars = days
    .map((day, i) => {
      const x = i * (barW + gap)
      const barH = Math.max(3, Math.round((day.seconds / maxSec) * chartH))
      const y = chartH - barH
      const fill = day.seconds > 0 ? '#6366f1' : '#e2e8f0'
      // Day label: Mon/Tue/etc from YYYY-MM-DD
      const [yr, mo, dy] = day.date.split('-').map(Number)
      const dow = new Date(Date.UTC(yr, mo - 1, dy, 12)).toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      })
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${fill}"/><text x="${x + barW / 2}" y="${chartH + 12}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="sans-serif">${escapeHtml(dow)}</text>`
    })
    .join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 8px 0;"><tr><td>
    <svg width="${totalW}" height="${chartH + labelH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Daily activity chart">${bars}</svg>
  </td></tr></table>`
}

export function weeklyUserReportHtml(params: WeeklyUserReportParams): string {
  const {
    userName,
    dateRange,
    totalSeconds,
    currentStreak,
    topProject,
    dailyBreakdown,
    dashboardLink,
  } = params

  const hasActivity = totalSeconds > 0

  const chart = dailyBreakdown.length === 7 ? svgBarChart(dailyBreakdown) : ''

  const inner = `
<p style="margin:0 0 6px 0;font-size:16px;line-height:1.65;color:#475569;">Hi <strong style="color:#0f172a;">${escapeHtml(userName)}</strong>,</p>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#64748b;">Here&apos;s your weekly summary for <strong style="color:#334155;">${escapeHtml(dateRange)}</strong>.</p>

${hasActivity ? '' : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;font-size:14px;color:#92400e;">No time tracked this week — open TrackSync and start a session to build your streak.</td></tr></table>`}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:4px;">
  <tr>
    ${metricCard('Total time', fmtHours(totalSeconds), hasActivity ? undefined : 'No time tracked this week')}
    ${metricCard('Current streak', currentStreak === 0 ? '–' : `${currentStreak}d`, currentStreak === 1 ? '1 day streak' : currentStreak > 1 ? `${currentStreak} days in a row` : 'Start your streak!')}
  </tr>
  <tr>
    ${metricCard('Top project', topProject ?? '–', topProject ? undefined : 'No sessions logged')}
    ${metricCard('Days active', String(dailyBreakdown.filter((d) => d.seconds > 0).length), 'out of 7')}
  </tr>
</table>

${chart}

<p style="margin:12px 0 4px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;">Daily breakdown</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:20px;">
  ${dailyBreakdown
    .map((d) => {
      const [yr, mo, dy] = d.date.split('-').map(Number)
      const label = new Date(Date.UTC(yr, mo - 1, dy, 12)).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
      return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:${d.seconds > 0 ? '#0f172a' : '#cbd5e1'};text-align:right;">${fmtHours(d.seconds)}</td>
    </tr>`
    })
    .join('')}
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px 0;">
  <tr>
    <td align="left">
      <a href="${escapeHtml(dashboardLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;background:#6366f1;background-image:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">View dashboard &rarr;</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">Manage your notification preferences in <a href="${escapeHtml(dashboardLink)}/settings" style="color:#6366f1;text-decoration:none;">account settings</a>.</p>
`

  return emailBaseLayout(inner, {
    eyebrow: 'Weekly Report',
    title: 'Your week in review',
  })
}
