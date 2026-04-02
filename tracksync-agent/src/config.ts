import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { log } from './logger.js'

export interface JiraConfig {
  baseUrl: string
  pat: string
}

export interface TrackSyncConfig {
  apiUrl: string
  token: string
}

export type TimeLoggingMethod = 'jira_worklog' | 'tempo_selfhosted'

export interface TimeLoggingConfig {
  method: TimeLoggingMethod
  commandPollIntervalSeconds: number
}

export interface SyncConfig {
  /** If true, JQL is only the incremental time window (all projects, types, statuses). */
  syncAllIssues: boolean
  /**
   * When true, the first Jira search after startup omits the `updated` window and pulls the full
   * catalog (subject to project/type/status filters). Later runs stay incremental.
   */
  fullBackfillOnFirstRun: boolean
  pollIntervalMinutes: number
  projects: string[]
  issueTypes: string[]
  statuses: string[]
  fields: string[]
  excludeFields: string[]
  timeLogging: TimeLoggingConfig
}

export interface AgentConfig {
  jira: JiraConfig
  tracksync: TrackSyncConfig
  sync: SyncConfig
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Deep merge: `over` wins on conflicts. Arrays and scalars from `over` replace. */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  over: Record<string, unknown>
): T {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    if (isPlainObject(v) && isPlainObject(out[k] as unknown)) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v)
    } else {
      out[k] = v
    }
  }
  return out as T
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function requirePositiveInt(value: unknown, name: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error(`${name} must be a positive integer`)
  }
  return n
}

function requireStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`)
  }
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${name} must contain only non-empty strings`)
    }
    out.push(item.trim())
  }
  return out
}

function optionalStringArray(value: unknown, name: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
  const out: string[] = []
  for (let i = 0; i < value.length; i++) {
    const item = value[i]
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${name}[${i}] must be a non-empty string`)
    }
    out.push(item.trim())
  }
  return out
}

export function validateAgentConfig(raw: unknown): AgentConfig {
  if (!isPlainObject(raw)) {
    throw new Error('Config root must be an object')
  }
  const j = raw.jira
  const t = raw.tracksync
  const s = raw.sync
  if (!isPlainObject(j)) {
    throw new Error('jira section is required')
  }
  if (!isPlainObject(t)) {
    throw new Error('tracksync section is required')
  }
  if (!isPlainObject(s)) {
    throw new Error('sync section is required')
  }

  const baseUrl = requireNonEmptyString(j.baseUrl, 'jira.baseUrl')
  const pat = requireNonEmptyString(j.pat, 'jira.pat')
  const apiUrl = requireNonEmptyString(t.apiUrl, 'tracksync.apiUrl')
  const token = requireNonEmptyString(t.token, 'tracksync.token')

  const pollIntervalMinutes = requirePositiveInt(s.pollIntervalMinutes, 'sync.pollIntervalMinutes')
  const syncAllIssues = s.syncAllIssues === true
  const fullBackfillOnFirstRun = s.fullBackfillOnFirstRun === true
  let projects: string[]
  let issueTypes: string[]
  let statuses: string[]
  if (syncAllIssues) {
    projects = optionalStringArray(s.projects, 'sync.projects')
    issueTypes = optionalStringArray(s.issueTypes, 'sync.issueTypes')
    statuses = optionalStringArray(s.statuses, 'sync.statuses')
  } else {
    projects = requireStringArray(s.projects, 'sync.projects')
    issueTypes = requireStringArray(s.issueTypes, 'sync.issueTypes')
    statuses = requireStringArray(s.statuses, 'sync.statuses')
  }
  const fields = requireStringArray(s.fields, 'sync.fields')
  const excludeFields = Array.isArray(s.excludeFields)
    ? s.excludeFields.map((x, i) => {
        if (typeof x !== 'string' || x.trim() === '') {
          throw new Error(`sync.excludeFields[${i}] must be a non-empty string`)
        }
        return x.trim()
      })
    : []

  let timeLoggingMethod: TimeLoggingMethod = 'jira_worklog'
  let commandPollIntervalSeconds = 30
  const tl = s.timeLogging
  if (tl !== undefined) {
    if (!isPlainObject(tl)) {
      throw new Error('sync.timeLogging must be an object')
    }
    const m = tl.method
    if (m !== undefined) {
      if (m !== 'jira_worklog' && m !== 'tempo_selfhosted') {
        throw new Error('sync.timeLogging.method must be jira_worklog or tempo_selfhosted')
      }
      timeLoggingMethod = m
    }
    if (tl.commandPollIntervalSeconds !== undefined) {
      commandPollIntervalSeconds = requirePositiveInt(
        tl.commandPollIntervalSeconds,
        'sync.timeLogging.commandPollIntervalSeconds'
      )
    }
  }

  return {
    jira: { baseUrl: baseUrl.replace(/\/+$/, ''), pat },
    tracksync: { apiUrl: apiUrl.replace(/\/+$/, ''), token },
    sync: {
      syncAllIssues,
      fullBackfillOnFirstRun,
      pollIntervalMinutes,
      projects,
      issueTypes,
      statuses,
      fields,
      excludeFields,
      timeLogging: {
        method: timeLoggingMethod,
        commandPollIntervalSeconds,
      },
    },
  }
}

/**
 * Config file resolution: explicit arg → TRACKSYNC_AGENT_CONFIG →
 * `./tracksync-agent.config.local.yaml` if it exists → `./tracksync-agent.config.yaml`.
 */
export function resolveAgentConfigPath(explicitPath?: string): string {
  if (explicitPath !== undefined && explicitPath !== '') {
    return explicitPath
  }
  if (process.env.TRACKSYNC_AGENT_CONFIG) {
    return process.env.TRACKSYNC_AGENT_CONFIG
  }
  const cwd = process.cwd()
  const localPath = path.join(cwd, 'tracksync-agent.config.local.yaml')
  if (fs.existsSync(localPath)) {
    return localPath
  }
  return path.join(cwd, 'tracksync-agent.config.yaml')
}

export function applyEnvOverrides(raw: Record<string, unknown>): Record<string, unknown> {
  const jira = isPlainObject(raw.jira) ? { ...raw.jira } : {}
  const tracksync = isPlainObject(raw.tracksync) ? { ...raw.tracksync } : {}
  if (process.env.JIRA_BASE_URL) jira.baseUrl = process.env.JIRA_BASE_URL
  if (process.env.JIRA_PAT) jira.pat = process.env.JIRA_PAT
  if (process.env.TRACKSYNC_API_URL) tracksync.apiUrl = process.env.TRACKSYNC_API_URL
  if (process.env.TRACKSYNC_TOKEN) tracksync.token = process.env.TRACKSYNC_TOKEN
  return { ...raw, jira, tracksync }
}

export function loadLocalConfigFile(configPath: string): unknown {
  const resolved = path.resolve(configPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`)
  }
  const text = fs.readFileSync(resolved, 'utf8')
  return yaml.load(text)
}

export function loadAndValidateConfig(configPath?: string): AgentConfig {
  const file = resolveAgentConfigPath(configPath)
  const raw = loadLocalConfigFile(file)
  if (!isPlainObject(raw)) {
    throw new Error('Config file must parse to an object')
  }
  return validateAgentConfig(applyEnvOverrides(raw))
}

export async function fetchRemoteAgentConfig(
  apiUrl: string,
  token: string
): Promise<Record<string, unknown> | null> {
  const url = `${apiUrl}/config`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      log.warn(`Remote config GET ${url} returned ${res.status}; using local config only.`)
      return null
    }
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text) as unknown
    } catch {
      log.warn('Remote config response was not valid JSON; using local config only.')
      return null
    }
    if (!isPlainObject(data)) {
      log.warn('Remote config JSON root must be an object; using local config only.')
      return null
    }
    return data
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.warn(`Remote config fetch failed (${msg}) from ${url}; using local config only.`)
    return null
  }
}
