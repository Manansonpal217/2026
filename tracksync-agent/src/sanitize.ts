import type { JiraIssue } from './jira.js'

export function sanitizeIssue(issue: JiraIssue, excludeFields: string[]): JiraIssue {
  const clone = JSON.parse(JSON.stringify(issue)) as JiraIssue
  if (!clone.fields || typeof clone.fields !== 'object') {
    clone.fields = {}
    return clone
  }
  const fields = { ...clone.fields } as Record<string, unknown>
  for (const key of excludeFields) {
    delete fields[key]
  }
  clone.fields = fields
  return clone
}

export function sanitizeIssues(issues: JiraIssue[], excludeFields: string[]): JiraIssue[] {
  return issues.map((i) => sanitizeIssue(i, excludeFields))
}
