import type { AgentConfig } from './config.js'
import { log } from './logger.js'

export interface JiraIssue {
  id: string
  key: string
  self?: string
  fields: Record<string, unknown>
}

interface JiraSearchResponse {
  startAt: number
  maxResults: number
  total: number
  issues: JiraIssue[]
}

/** Escape a value for use inside JQL double-quoted strings. */
export function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** JQL predicate that matches essentially all issues (Jira requires a non-empty query). */
const FULL_CATALOG_CREATED_CLAUSE = 'created >= "1970-01-01"'

export function buildJql(
  config: AgentConfig,
  lastSyncAt?: Date,
  options?: { fullCatalog?: boolean }
): string {
  const { syncAllIssues, projects, issueTypes, statuses, pollIntervalMinutes } = config.sync
  const useFullCatalog = options?.fullCatalog === true

  const timeClause =
    lastSyncAt === undefined ? 'updated >= -24h' : `updated >= -${pollIntervalMinutes}m`

  if (syncAllIssues) {
    return useFullCatalog ? FULL_CATALOG_CREATED_CLAUSE : timeClause
  }
  const projectList = projects.map(jqlQuote).join(', ')
  const typeList = issueTypes.map(jqlQuote).join(', ')
  const statusList = statuses.map(jqlQuote).join(', ')
  const scope = [
    `project in (${projectList})`,
    `type in (${typeList})`,
    `status in (${statusList})`,
  ]
  if (useFullCatalog) {
    return scope.join(' AND ')
  }
  return [...scope, timeClause].join(' AND ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetries(url: string, init: RequestInit, label: string): Promise<Response> {
  const maxAttempts = 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status}`)
        if (attempt < maxAttempts) {
          const backoffMs = 1000 * 2 ** (attempt - 1)
          log.error(`${label} returned ${res.status}. Retrying in ${backoffMs / 1000}s...`)
          await sleep(backoffMs)
          continue
        }
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt < maxAttempts) {
        const backoffMs = 1000 * 2 ** (attempt - 1)
        const msg = e instanceof Error ? e.message : String(e)
        log.error(`${label} unreachable (${msg}). Retrying in ${backoffMs / 1000}s...`)
        await sleep(backoffMs)
        continue
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function fetchJiraIssues(
  config: AgentConfig,
  lastSyncAt?: Date,
  options?: { fullCatalog?: boolean }
): Promise<JiraIssue[]> {
  const jql = buildJql(config, lastSyncAt, options)
  const base = config.jira.baseUrl
  const url = `${base}/rest/api/2/search`
  const maxResults = 100
  const all: JiraIssue[] = []
  let startAt = 0
  let total = 0

  do {
    const body = {
      jql,
      startAt,
      maxResults,
      fields: config.sync.fields,
    }
    const res = await fetchWithRetries(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.jira.pat}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'Jira'
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Jira search failed: ${res.status} ${text.slice(0, 500)}`)
    }

    const data = (await res.json()) as JiraSearchResponse
    total = data.total
    const batch = data.issues ?? []
    all.push(...batch)
    startAt = data.startAt + batch.length
  } while (startAt < total)

  const label = options?.fullCatalog
    ? ' (full catalog)'
    : lastSyncAt === undefined
      ? ''
      : ' (incremental)'
  log.info(`Fetched ${all.length} issues from Jira${label}.`)
  return all
}
