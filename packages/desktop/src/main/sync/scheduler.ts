import { net } from 'electron'
import { syncPendingSessions } from './sessionSync.js'
import { syncPendingScreenshots } from './screenshotSync.js'
import { syncPendingActivityLogs } from './activitySync.js'

const SYNC_INTERVAL_MS = 30_000 // 30 seconds
const MIN_RETRY_INTERVAL_MS = 5_000

let syncIntervalId: ReturnType<typeof setInterval> | null = null
let isSyncing = false
let lastSyncAttempt = 0
let wasOffline = false

async function runSync(): Promise<void> {
  if (isSyncing) return
  const now = Date.now()
  if (now - lastSyncAttempt < MIN_RETRY_INTERVAL_MS) return

  isSyncing = true
  lastSyncAttempt = now
  try {
    await Promise.allSettled([
      syncPendingSessions(),
      syncPendingScreenshots(),
      syncPendingActivityLogs(),
    ])
  } catch {
    // Silent — sync errors are recorded per-item
  } finally {
    isSyncing = false
  }
}

/** Start the background sync scheduler. */
export function startSyncScheduler(): void {
  if (syncIntervalId !== null) return

  // Run once immediately in case there are pending sessions
  runSync()

  // Recurring 30-second sync
  syncIntervalId = setInterval(() => {
    const online = net.isOnline()
    if (online && wasOffline) {
      // Network just restored — reset the retry gate and sync immediately
      lastSyncAttempt = 0
      wasOffline = false
    } else if (!online) {
      wasOffline = true
    }
    if (online) runSync()
  }, SYNC_INTERVAL_MS)
}

/** Stop the sync scheduler (call on app quit). */
export function stopSyncScheduler(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId)
    syncIntervalId = null
  }
}

/** Trigger an immediate sync (e.g., after timer stop or on window focus). */
export function triggerImmediateSync(): void {
  if (net.isOnline()) runSync()
}
