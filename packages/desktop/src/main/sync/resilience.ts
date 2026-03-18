import type Database from 'better-sqlite3'

const STALE_RECOVERY_HOURS = 24

/**
 * Reset sync_attempts for items stuck >24h so they get a fresh retry cycle.
 * Run at start of each sync cycle (or on startup).
 */
export function resetStaleSyncAttempts(database: Database.Database): void {
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - STALE_RECOVERY_HOURS)
  const cutoffIso = cutoff.toISOString()

  database
    .prepare(
      `UPDATE local_sessions SET sync_attempts = 0, last_sync_error = NULL, last_sync_attempt_at = NULL
       WHERE synced = 0 AND last_sync_attempt_at IS NOT NULL
         AND last_sync_attempt_at < ?`
    )
    .run(cutoffIso)

  database
    .prepare(
      `UPDATE local_screenshots SET sync_attempts = 0, last_sync_error = NULL, last_sync_attempt_at = NULL
       WHERE synced = 0 AND last_sync_attempt_at IS NOT NULL
         AND last_sync_attempt_at < ?`
    )
    .run(cutoffIso)

  database
    .prepare(
      `UPDATE local_activity_logs SET sync_attempts = 0, last_sync_error = NULL, last_sync_attempt_at = NULL
       WHERE synced = 0 AND last_sync_attempt_at IS NOT NULL
         AND last_sync_attempt_at < ?`
    )
    .run(cutoffIso)
}

/** Exponential backoff: min(2^min(attempts, 5), 60) minutes */
export function getBackoffMinutes(syncAttempts: number): number {
  return Math.min(2 ** Math.min(syncAttempts, 5), 60)
}
