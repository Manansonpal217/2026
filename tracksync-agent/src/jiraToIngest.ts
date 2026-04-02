import type { JiraIssue } from './jira.js'

/** Shape expected by TrackSync POST /ingest/jira */
export interface IngestIssueRow {
  id: string
  key: string
  summary?: string | null
  status?: string | null
  assignee_email?: string | null
  priority?: string | null
  due_date?: string | null
  labels?: string[]
  raw?: Record<string, unknown>
}

function fieldString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (
    v &&
    typeof v === 'object' &&
    'name' in v &&
    typeof (v as { name: unknown }).name === 'string'
  ) {
    return (v as { name: string }).name
  }
  return null
}

/** Normalize Jira `duedate` (often `yyyy-MM-dd`) to RFC3339 with offset for API validation. */
function dueDateToIso(d: unknown): string | null {
  if (d == null) return null
  const s = String(d).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString()
}

export function jiraIssueToIngestRow(issue: JiraIssue): IngestIssueRow {
  const f = (issue.fields ?? {}) as Record<string, unknown>
  const summary = typeof f.summary === 'string' ? f.summary : fieldString(f.summary)
  const status = fieldString(f.status)
  const priority = fieldString(f.priority)
  let assignee_email: string | null = null
  const assignee = f.assignee
  if (assignee && typeof assignee === 'object' && assignee !== null) {
    const em = (assignee as { emailAddress?: unknown }).emailAddress
    if (typeof em === 'string') assignee_email = em
  }
  const labelsRaw = f.labels
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.filter((x): x is string => typeof x === 'string')
    : []

  return {
    id: String(issue.id),
    key: issue.key,
    summary,
    status,
    assignee_email,
    priority,
    due_date: dueDateToIso(f.duedate),
    labels,
    raw: { id: issue.id, key: issue.key, self: issue.self, fields: issue.fields },
  }
}
