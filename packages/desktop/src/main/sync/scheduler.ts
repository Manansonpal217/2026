import { net } from 'electron'
import { getDb } from '../db/index.js'
import { resetStaleSyncAttempts } from './resilience.js'
import { syncPendingSessions } from './sessionSync.js'
import { syncPendingScreenshots } from './screenshotSync.js'
import { syncPendingActivityLogs } from './activitySync.js'
import { getApiBase } from './sessionSync.js'

const SYNC_INTERVAL_MS = 30_000 // 30 seconds when healthy
const SYNC_BACKOFF_MS = 60_000 // 60 seconds when health check fails
const SYNC_RATE_LIMITED_MS = 120_000 // 2 minutes when 429
const MIN_RETRY_INTERVAL_MS = 5_000
const STARTUP_STAGGER_MS = 10_000 // 0–10s random delay to avoid thundering herd

let scheduleTimeoutId: ReturnType<typeof setTimeout> | null = null
let startupStaggerId: ReturnType<typeof setTimeout> | null = null
let isSchedulerRunning = false
let isSyncing = false
let lastSyncAttempt = 0
let wasOffline = false

async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/health`, { signal: AbortSignal.timeout(10_000) })
    return res.ok
  } catch {
    return false
  }
}

/** Returns next delay in ms: 60s if health failed, 2min if 429, else 30s */
async function runSync(): Promise<number> {
  if (isSyncing) return SYNC_INTERVAL_MS
  const now = Date.now()
  if (now - lastSyncAttempt < MIN_RETRY_INTERVAL_MS) return SYNC_INTERVAL_MS

  if (!(await checkBackendHealth())) {
    return SYNC_BACKOFF_MS
  }

  isSyncing = true
  lastSyncAttempt = now
  let rateLimited = false
  try {
    const db = getDb()
    resetStaleSyncAttempts(db)

    const [sessionsResult, screenshotsResult, activityResult] = await Promise.allSettled([
      syncPendingSessions(),
      syncPendingScreenshots(),
      syncPendingActivityLogs(),
    ])
    if (sessionsResult.status === 'fulfilled' && sessionsResult.value?.rateLimited)
      rateLimited = true
    if (screenshotsResult.status === 'fulfilled' && screenshotsResult.value?.rateLimited)
      rateLimited = true
    if (activityResult.status === 'fulfilled' && activityResult.value?.rateLimited)
      rateLimited = true
  } catch {
    // Silent — sync errors are recorded per-item
  } finally {
    isSyncing = false
  }

  return rateLimited ? SYNC_RATE_LIMITED_MS : SYNC_INTERVAL_MS
}

function scheduleNext(delayMs: number): void {
  scheduleTimeoutId = setTimeout(async () => {
    scheduleTimeoutId = null
    const online = net.isOnline()
    if (online && wasOffline) {
      lastSyncAttempt = 0
      wasOffline = false
    } else if (!online) {
      wasOffline = true
    }
    if (online) {
      const nextDelay = await runSync()
      scheduleNext(nextDelay)
    } else {
      scheduleNext(SYNC_INTERVAL_MS)
    }
  }, delayMs)
}

/** Start the background sync scheduler. */
export function startSyncScheduler(): void {
  if (isSchedulerRunning) return
  isSchedulerRunning = true

  const delayMs = Math.floor(Math.random() * (STARTUP_STAGGER_MS + 1))
  startupStaggerId = setTimeout(async () => {
    startupStaggerId = null
    if (net.isOnline()) {
      const nextDelay = await runSync()
      scheduleNext(nextDelay)
    } else {
      wasOffline = true
      scheduleNext(SYNC_INTERVAL_MS)
    }
  }, delayMs)
}

/** Stop the sync scheduler (call on app quit). */
export function stopSyncScheduler(): void {
  isSchedulerRunning = false
  if (startupStaggerId !== null) {
    clearTimeout(startupStaggerId)
    startupStaggerId = null
  }
  if (scheduleTimeoutId !== null) {
    clearTimeout(scheduleTimeoutId)
    scheduleTimeoutId = null
  }
}

/** Trigger an immediate sync (e.g., after timer stop or on window focus). */
export function triggerImmediateSync(): void {
  if (net.isOnline()) runSync()
}
