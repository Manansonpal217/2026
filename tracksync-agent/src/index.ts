import cron from 'node-cron'
import path from 'node:path'
import {
  applyEnvOverrides,
  deepMerge,
  fetchRemoteAgentConfig,
  isPlainObject,
  loadLocalConfigFile,
  resolveAgentConfigPath,
  validateAgentConfig,
} from './config.js'
import { fetchJiraIssues } from './jira.js'
import { log } from './logger.js'
import { sanitizeIssues } from './sanitize.js'
import { sendToTrackSync } from './tracksync.js'
import { startHeartbeat } from './heartbeat.js'
// ADDED: bidirectional agent command queue (log time to Jira/Tempo)
import { pollAndExecuteCommands } from './commands.js'
import { loadAgentState, markFullBackfillComplete } from './agentState.js'
import type { JiraIssue } from './jira.js'

const MAX_QUEUED_ISSUES = 5000

function dedupeByKey(preferredLast: JiraIssue[]): Map<string, JiraIssue> {
  const map = new Map<string, JiraIssue>()
  for (const issue of preferredLast) {
    map.set(issue.key, issue)
  }
  return map
}

function mergeIssues(queue: JiraIssue[], fetched: JiraIssue[]): JiraIssue[] {
  const map = dedupeByKey(queue)
  for (const issue of fetched) {
    map.set(issue.key, issue)
  }
  return [...map.values()]
}

function capQueue(issues: JiraIssue[]): JiraIssue[] {
  if (issues.length <= MAX_QUEUED_ISSUES) return issues
  log.warn(
    `Pending issue queue exceeds ${MAX_QUEUED_ISSUES}; dropping oldest ${issues.length - MAX_QUEUED_ISSUES} entries.`
  )
  return issues.slice(-MAX_QUEUED_ISSUES)
}

async function main(): Promise<void> {
  const configPath = resolveAgentConfigPath()

  const resolvedConfigPath = path.resolve(configPath)
  log.info(`Config file: ${resolvedConfigPath}`)
  const raw = loadLocalConfigFile(configPath)
  if (!isPlainObject(raw)) {
    throw new Error('Config file must parse to an object')
  }
  let rawObj: Record<string, unknown> = raw

  const tsRaw = isPlainObject(rawObj.tracksync) ? rawObj.tracksync : {}
  const apiUrlRaw = typeof tsRaw.apiUrl === 'string' ? tsRaw.apiUrl.trim() : ''
  const tokenRaw = typeof tsRaw.token === 'string' ? tsRaw.token.trim() : ''
  const apiUrlForRemote = (process.env.TRACKSYNC_API_URL ?? apiUrlRaw).replace(/\/+$/, '')
  const tokenForRemote = (process.env.TRACKSYNC_TOKEN ?? tokenRaw).trim()

  if (apiUrlForRemote && tokenForRemote) {
    const remote = await fetchRemoteAgentConfig(apiUrlForRemote, tokenForRemote)
    if (remote) {
      rawObj = deepMerge(rawObj, remote)
      log.info('Merged remote agent config over local values.')
    }
  } else {
    log.warn(
      'Skipping remote config fetch (need tracksync.apiUrl and tracksync.token in YAML or env).'
    )
  }

  const config = validateAgentConfig(applyEnvOverrides(rawObj))

  log.info(
    `Agent started. Polling every ${config.sync.pollIntervalMinutes} mins.${
      config.sync.syncAllIssues
        ? ` JQL: all issues (${config.sync.fullBackfillOnFirstRun ? 'full catalog on first run, then time window' : 'time window only'}).`
        : ''
    }`
  )

  let lastSyncAtForJql: Date | undefined = undefined
  let agentState = loadAgentState(resolvedConfigPath)
  let lastSyncCount = 0
  /** ISO timestamp for heartbeat; updated after successful ingest or empty cycle with nothing queued */
  let lastSyncIsoForHeartbeat: string | null = null
  let pendingQueue: JiraIssue[] = []
  let shuttingDown = false

  const getHeartbeatState = () => ({
    lastSyncAt: lastSyncIsoForHeartbeat,
    lastSyncCount,
  })

  const stopHeartbeat = startHeartbeat({
    apiUrl: config.tracksync.apiUrl,
    token: config.tracksync.token,
    getState: getHeartbeatState,
  })

  // ADDED: poll TrackSync for commands on an interval independent of issue sync
  const runCommandsPoll = (): void => {
    if (!shuttingDown) void pollAndExecuteCommands(config)
  }
  void runCommandsPoll()
  const commandsPollIntervalId = setInterval(
    runCommandsPoll,
    config.sync.timeLogging.commandPollIntervalSeconds * 1000
  )

  const runSyncCycle = async (): Promise<void> => {
    if (shuttingDown) return
    try {
      let fetched: JiraIssue[] = []
      const useFullCatalog =
        config.sync.fullBackfillOnFirstRun &&
        lastSyncAtForJql === undefined &&
        !agentState.completedFullBackfill

      try {
        fetched = await fetchJiraIssues(config, lastSyncAtForJql, {
          fullCatalog: useFullCatalog,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.warn(`Jira unreachable or error; skipping this cycle: ${msg}`)
        return
      }

      lastSyncAtForJql = new Date()

      const sanitizedFetched = sanitizeIssues(fetched, config.sync.excludeFields)
      const toSend = mergeIssues(pendingQueue, sanitizedFetched)

      if (toSend.length === 0) {
        if (useFullCatalog) {
          markFullBackfillComplete(resolvedConfigPath)
          agentState = { completedFullBackfill: true }
        }
        log.info('No issues to send to TrackSync this cycle.')
        lastSyncCount = 0
        lastSyncIsoForHeartbeat = new Date().toISOString()
        pendingQueue = []
        return
      }

      const result = await sendToTrackSync(config.tracksync.apiUrl, config.tracksync.token, toSend)

      if (result.ok) {
        if (useFullCatalog) {
          markFullBackfillComplete(resolvedConfigPath)
          agentState = { completedFullBackfill: true }
        }
        pendingQueue = []
        lastSyncCount = toSend.length
        lastSyncIsoForHeartbeat = new Date().toISOString()
      } else {
        pendingQueue = capQueue(toSend)
        log.warn(`TrackSync ingest failed; ${pendingQueue.length} issue(s) queued for retry.`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`Unexpected error in sync cycle: ${msg}`)
    }
  }

  await runSyncCycle()

  const pollMs = config.sync.pollIntervalMinutes * 60 * 1000
  let lastPollRun = Date.now()

  const cronTask = cron.schedule('* * * * *', () => {
    if (shuttingDown) return
    const now = Date.now()
    if (now - lastPollRun >= pollMs) {
      lastPollRun = now
      void runSyncCycle()
    }
  })

  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info(`Received ${signal}; shutting down.`)
    // ADDED: stop command polling timer
    clearInterval(commandsPollIntervalId)
    cronTask.stop()
    stopHeartbeat()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e)
  log.error(`Fatal: ${msg}`)
  process.exit(1)
})
