import { getDb } from '../db/index.js'
import {
  getPendingSyncCount,
  syncActiveRunningSessionIfAny,
  syncPendingSessions,
} from './sessionSync.js'
import { syncPendingActivityLogs } from './activitySync.js'
import { syncPendingScreenshots } from './screenshotSync.js'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type MarkForResyncCounts = {
  completedSessionsReset: number
  activityLogsReset: number
  pendingScreenshotsRetryCleared: number
  /** Completed sessions stored locally before this repair (any sync state). */
  localCompletedTotal: number
  /** Of those, how many had a non-null project_id (needed for web labels). */
  localCompletedWithProject: number
  /** Of those, how many had a non-null task_id. */
  localCompletedWithTask: number
}

/**
 * Re-queue local data so the next sync pushes it to the server again.
 * - Completed time sessions: marked unsynced so batch upsert refreshes project/task/notes.
 * - Activity logs: all rows marked unsynced (server upserts by id — safe).
 * - Screenshots: only clears retry state for rows still pending (synced=0). Already-uploaded
 *   shots had local files deleted — they cannot be re-sent from this device.
 */
export function markLocalDataForFullResync(): MarkForResyncCounts {
  const db = getDb()

  const localCompletedTotal = (
    db.prepare(`SELECT COUNT(*) as c FROM local_sessions WHERE ended_at IS NOT NULL`).get() as {
      c: number
    }
  ).c
  const localCompletedWithProject = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM local_sessions WHERE ended_at IS NOT NULL AND project_id IS NOT NULL AND trim(project_id) != ''`
      )
      .get() as { c: number }
  ).c
  const localCompletedWithTask = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM local_sessions WHERE ended_at IS NOT NULL AND task_id IS NOT NULL AND trim(task_id) != ''`
      )
      .get() as { c: number }
  ).c

  const completedSessionsReset = db
    .prepare(
      `UPDATE local_sessions
       SET synced = 0,
           sync_attempts = 0,
           last_sync_error = NULL,
           last_sync_attempt_at = NULL
       WHERE ended_at IS NOT NULL`
    )
    .run().changes

  const activityLogsReset = db
    .prepare(
      `UPDATE local_activity_logs
       SET synced = 0,
           sync_attempts = 0,
           last_sync_error = NULL,
           last_sync_attempt_at = NULL`
    )
    .run().changes

  const pendingScreenshotsRetryCleared = db
    .prepare(
      `UPDATE local_screenshots
       SET sync_attempts = 0,
           last_sync_error = NULL,
           last_sync_attempt_at = NULL,
           pending_upload_id = NULL
       WHERE synced = 0`
    )
    .run().changes

  return {
    completedSessionsReset,
    activityLogsReset,
    pendingScreenshotsRetryCleared,
    localCompletedTotal,
    localCompletedWithProject,
    localCompletedWithTask,
  }
}

export type PendingSyncBreakdown = {
  sessions: number
  activityLogs: number
  screenshots: number
}

export function getPendingSyncBreakdown(): PendingSyncBreakdown {
  const db = getDb()
  const sessions = getPendingSyncCount()
  const activityLogs = (
    db.prepare(`SELECT COUNT(*) as c FROM local_activity_logs WHERE synced = 0`).get() as {
      c: number
    }
  ).c
  const screenshots = (
    db.prepare(`SELECT COUNT(*) as c FROM local_screenshots WHERE synced = 0`).get() as {
      c: number
    }
  ).c
  return { sessions, activityLogs, screenshots }
}

export type DrainSyncResult = {
  rounds: number
  rateLimitedWaits: number
  remaining: PendingSyncBreakdown
}

/**
 * Run sync repeatedly until nothing is pending or maxRounds is hit.
 * Sessions run before activity/screenshots in each round so the server has session rows first.
 */
export async function drainPendingSyncQueue(maxRounds = 400): Promise<DrainSyncResult> {
  let rounds = 0
  let rateLimitedWaits = 0

  while (rounds < maxRounds) {
    const before = getPendingSyncBreakdown()
    if (before.sessions === 0 && before.activityLogs === 0 && before.screenshots === 0) {
      return { rounds, rateLimitedWaits, remaining: before }
    }

    rounds++

    const sr = await syncPendingSessions()
    if (sr.rateLimited) {
      rateLimitedWaits++
      await sleep(65_000)
      continue
    }

    const ar = await syncPendingActivityLogs()
    if (ar?.rateLimited) {
      rateLimitedWaits++
      await sleep(65_000)
      continue
    }

    const tr = await syncPendingScreenshots()
    if (tr?.rateLimited) {
      rateLimitedWaits++
      await sleep(65_000)
      continue
    }

    await syncActiveRunningSessionIfAny()

    const after = getPendingSyncBreakdown()
    if (
      after.sessions === before.sessions &&
      after.activityLogs === before.activityLogs &&
      after.screenshots === before.screenshots
    ) {
      // No progress (e.g. auth missing, permanent errors) — avoid spinning forever
      return { rounds, rateLimitedWaits, remaining: after }
    }
  }

  return { rounds, rateLimitedWaits, remaining: getPendingSyncBreakdown() }
}
