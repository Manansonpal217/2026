export type LogTimeMethod = 'jira_worklog' | 'tempo_selfhosted'

export interface LogTimePayload {
  issueKey: string
  timeSpent: string
  comment: string
  started: string
  authorEmail: string
  method?: LogTimeMethod
  /** Optional Tempo worker username; falls back to local part of authorEmail */
  worker?: string
}

function parseJiraErrorBody(text: string): string {
  try {
    const j = JSON.parse(text) as {
      errorMessages?: string[]
      errors?: Record<string, string>
    }
    const parts: string[] = []
    if (Array.isArray(j.errorMessages) && j.errorMessages.length > 0) {
      parts.push(...j.errorMessages)
    }
    if (j.errors && typeof j.errors === 'object') {
      for (const [k, v] of Object.entries(j.errors)) {
        parts.push(`${k}: ${v}`)
      }
    }
    if (parts.length > 0) return parts.join('; ')
  } catch {
    /* ignore */
  }
  return text.slice(0, 500)
}

export function parseTimeSpent(timeSpent: string): number {
  const s = timeSpent.trim()
  if (s === '') {
    throw new Error('timeSpent is empty')
  }
  const re = /(\d+)\s*([hms])/gi
  let total = 0
  let matched = false
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    matched = true
    const n = parseInt(m[1], 10)
    const unit = m[2].toLowerCase()
    if (unit === 'h') total += n * 3600
    else if (unit === 'm') total += n * 60
    else if (unit === 's') total += n
  }
  if (!matched) {
    throw new Error(`Invalid timeSpent format: ${JSON.stringify(timeSpent)}`)
  }
  return total
}

/** Jira worklog API expects e.g. 2026-03-31T09:00:00.000+0000 */
export function toJiraWorklogStarted(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid started ISO datetime: ${JSON.stringify(iso)}`)
  }
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const se = String(d.getUTCSeconds()).padStart(2, '0')
  return `${y}-${mo}-${day}T${h}:${mi}:${se}.000+0000`
}

/** Tempo example uses local-style string without offset suffix */
export function toTempoDateStarted(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid started ISO datetime: ${JSON.stringify(iso)}`)
  }
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const se = String(d.getUTCSeconds()).padStart(2, '0')
  return `${y}-${mo}-${day}T${h}:${mi}:${se}.000`
}

export function workerFromAuthorEmail(email: string): string {
  const t = email.trim()
  const at = t.indexOf('@')
  if (at <= 0) return 'unknown'
  return t.slice(0, at)
}

export async function logTimeOnJira(
  baseUrl: string,
  pat: string,
  payload: LogTimePayload
): Promise<void> {
  const issueKey = encodeURIComponent(payload.issueKey)
  const url = `${baseUrl}/rest/api/2/issue/${issueKey}/worklog`
  const body = {
    timeSpent: payload.timeSpent,
    comment: payload.comment,
    started: toJiraWorklogStarted(payload.started),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = parseJiraErrorBody(text)
    throw new Error(`Jira returned ${res.status}. ${detail}`)
  }
}

export async function logTimeOnTempo(
  baseUrl: string,
  pat: string,
  payload: LogTimePayload
): Promise<void> {
  const url = `${baseUrl}/rest/tempo-timesheets/4/worklogs`
  const timeSpentSeconds = parseTimeSpent(payload.timeSpent)
  const worker =
    typeof payload.worker === 'string' && payload.worker.trim() !== ''
      ? payload.worker.trim()
      : workerFromAuthorEmail(payload.authorEmail)
  const body = {
    issueKey: payload.issueKey,
    timeSpentSeconds,
    dateStarted: toTempoDateStarted(payload.started),
    comment: payload.comment,
    worker,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = parseJiraErrorBody(text)
    throw new Error(`Tempo returned ${res.status}. ${detail}`)
  }
}
