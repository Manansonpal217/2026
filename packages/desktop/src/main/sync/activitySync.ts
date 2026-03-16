import { getDb } from '../db/index.js'
import { getApiBase, getAuthHeaders } from './sessionSync.js'

interface LocalActivityLog {
  id: string
  session_id: string
  window_start: string
  window_end: string
  keyboard_events: number
  mouse_clicks: number
  mouse_distance_px: number
  active_app: string | null
  activity_score: number
  sync_attempts: number
}

export async function syncPendingActivityLogs(): Promise<void> {
  const db = getDb()

  const unsynced = db
    .prepare(
      `SELECT * FROM local_activity_logs
       WHERE synced = 0 AND sync_attempts < 6
       ORDER BY window_start ASC LIMIT 100`,
    )
    .all() as LocalActivityLog[]

  if (unsynced.length === 0) return

  const apiBase = getApiBase()
  const headers = await getAuthHeaders()
  if (!headers) return

  try {
    const res = await fetch(`${apiBase}/v1/activity/batch`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logs: unsynced.map((log) => ({
          id: log.id,
          session_id: log.session_id,
          window_start: log.window_start,
          window_end: log.window_end,
          keyboard_events: log.keyboard_events,
          mouse_clicks: log.mouse_clicks,
          mouse_distance_px: log.mouse_distance_px,
          active_app: log.active_app,
          activity_score: log.activity_score,
        })),
      }),
    })

    if (!res.ok) {
      const markFailed = db.prepare(
        `UPDATE local_activity_logs SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
      )
      for (const log of unsynced) markFailed.run(`HTTP ${res.status}`, log.id)
      return
    }

    const data = (await res.json()) as {
      synced: string[]
      errors: { id: string; reason: string }[]
    }

    const markSynced = db.prepare(`UPDATE local_activity_logs SET synced = 1 WHERE id = ?`)
    const markFailed = db.prepare(
      `UPDATE local_activity_logs SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
    )

    for (const id of data.synced) markSynced.run(id)
    for (const { id, reason } of data.errors) markFailed.run(reason, id)
  } catch (err) {
    const markFailed = db.prepare(
      `UPDATE local_activity_logs SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
    )
    for (const log of unsynced)
      markFailed.run(err instanceof Error ? err.message : String(err), log.id)
  }
}
