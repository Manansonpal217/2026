import type { AgentConfig } from './config.js'
import { log } from './logger.js'
import {
  logTimeOnJira,
  logTimeOnTempo,
  type LogTimeMethod,
  type LogTimePayload,
} from './timelog.js'

interface AgentCommand {
  id: string
  type: string
  payload: unknown
}

interface CommandsResponse {
  commands: AgentCommand[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function resolveLogMethod(payload: LogTimePayload, defaultMethod: LogTimeMethod): LogTimeMethod {
  if (payload.method === 'jira_worklog' || payload.method === 'tempo_selfhosted') {
    return payload.method
  }
  return defaultMethod
}

async function acknowledgeCommand(
  apiUrl: string,
  token: string,
  commandId: string,
  status: 'success' | 'failed',
  error?: string
): Promise<void> {
  const url = `${apiUrl}/commands/${encodeURIComponent(commandId)}/ack`
  const body: { status: string; error?: string } = { status }
  if (error !== undefined) body.error = error
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      log.warn(`Command ack POST ${commandId} returned ${res.status}: ${text.slice(0, 200)}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.warn(`Command ack failed for ${commandId}: ${msg}`)
  }
}

function isLogTimePayload(p: unknown): p is LogTimePayload {
  if (typeof p !== 'object' || p === null) return false
  const o = p as Record<string, unknown>
  return (
    typeof o.issueKey === 'string' &&
    o.issueKey.trim() !== '' &&
    typeof o.timeSpent === 'string' &&
    typeof o.comment === 'string' &&
    typeof o.started === 'string' &&
    typeof o.authorEmail === 'string'
  )
}

async function runLogTimeWithRetries(
  config: AgentConfig,
  commandId: string,
  payload: LogTimePayload
): Promise<void> {
  const method = resolveLogMethod(payload, config.sync.timeLogging.method)
  const delaysMs = [2000, 4000]
  let lastError = 'Unknown error'

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (method === 'jira_worklog') {
        await logTimeOnJira(config.jira.baseUrl, config.jira.pat, payload)
      } else {
        await logTimeOnTempo(config.jira.baseUrl, config.jira.pat, payload)
      }
      return
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      log.error(`❌ ${commandId} failed (attempt ${attempt}/3): ${lastError}`)
      if (attempt < 3) {
        await sleep(delaysMs[attempt - 1])
      }
    }
  }

  log.error(`❌ ${commandId} failed permanently after 3 attempts.`)
  throw new Error(lastError)
}

async function executeCommand(config: AgentConfig, command: AgentCommand): Promise<void> {
  try {
    const { id, type } = command
    if (typeof id !== 'string' || id.trim() === '') {
      log.warn('Skipping command with missing id.')
      return
    }

    if (type !== 'log_time') {
      log.warn(`Unknown command type for ${id}: ${type}`)
      await acknowledgeCommand(
        config.tracksync.apiUrl,
        config.tracksync.token,
        id,
        'failed',
        'Unknown command type'
      )
      return
    }

    if (!isLogTimePayload(command.payload)) {
      const msg =
        'Invalid log_time payload (need issueKey, timeSpent, comment, started, authorEmail)'
      log.error(`❌ ${id}: ${msg}`)
      await acknowledgeCommand(config.tracksync.apiUrl, config.tracksync.token, id, 'failed', msg)
      return
    }

    const payload = command.payload
    log.info(`Executing command ${id} (log_time)...`)

    try {
      await runLogTimeWithRetries(config, id, payload)
      log.info(`✅ ${id} succeeded. Time logged on ${payload.issueKey}.`)
      await acknowledgeCommand(config.tracksync.apiUrl, config.tracksync.token, id, 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await acknowledgeCommand(config.tracksync.apiUrl, config.tracksync.token, id, 'failed', msg)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error(`executeCommand outer error: ${msg}`)
  }
}

export async function pollAndExecuteCommands(config: AgentConfig): Promise<void> {
  try {
    log.info('Polling for commands...')
    const url = `${config.tracksync.apiUrl}/commands`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.tracksync.token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      log.warn(`GET /agent/commands returned ${res.status}; skipping.`)
      return
    }
    let data: unknown
    try {
      data = (await res.json()) as unknown
    } catch {
      log.warn('GET /agent/commands response was not valid JSON.')
      return
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      log.warn('GET /agent/commands JSON root must be an object.')
      return
    }
    const cr = data as CommandsResponse
    if (!Array.isArray(cr.commands)) {
      log.warn('GET /agent/commands missing "commands" array.')
      return
    }
    log.info(`Received ${cr.commands.length} commands.`)
    for (const cmd of cr.commands) {
      await executeCommand(config, cmd as AgentCommand)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.warn(`pollAndExecuteCommands error: ${msg}`)
  }
}
