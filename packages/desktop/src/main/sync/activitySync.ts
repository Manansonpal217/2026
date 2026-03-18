import { getDb } from '../db/index.js'
import { getApiBase, getAuthHeaders } from './sessionSync.js'
import { getBackoffMinutes } from './resilience.js'

interface LocalActivityLog {
  id: string
  session_id: string
  window_start: string
  window_end: string
  keyboard_events: number
  mouse_clicks: number
  mouse_distance_px: number
  active_app: string | null
  active_url: string | null
  activity_score: number
  sync_attempts: number
  last_sync_attempt_at: string | null
}

const nowIso = () => new Date().toISOString()

export async function syncPendingActivityLogs(): Promise<{ rateLimited?: boolean } | void> {
  const db = getDb()

  const candidates = db
    .prepare(
      `SELECT * FROM local_activity_logs
       WHERE synced = 0
       ORDER BY window_start ASC LIMIT 400`
    )
    .all() as LocalActivityLog[]

  const unsynced = candidates
    .filter((log) => {
      const backoffMin = getBackoffMinutes(log.sync_attempts ?? 0)
      if (!log.last_sync_attempt_at) return true
      const lastAttempt = new Date(log.last_sync_attempt_at).getTime()
      return Date.now() - lastAttempt >= backoffMin * 60 * 1000
    })
    .slice(0, 200)

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
          active_url: log.active_url,
          activity_score: log.activity_score,
        })),
      }),
    })

    if (res.status === 429) return { rateLimited: true }

    if (!res.ok) {
      const isTransient = res.status >= 500
      const reason = `HTTP ${res.status}`
      const stmtTransient = db.prepare(
        `UPDATE local_activity_logs SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
      )
      const stmtPermanent = db.prepare(
        `UPDATE local_activity_logs SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
      )
      for (const log of unsynced) {
        if (isTransient) stmtTransient.run(nowIso(), reason, log.id)
        else stmtPermanent.run(reason, nowIso(), log.id)
      }
      return
    }

    const data = (await res.json()) as {
      synced: string[]
      errors: { id: string; reason: string }[]
    }

    const markSynced = db.prepare(`UPDATE local_activity_logs SET synced = 1 WHERE id = ?`)
    const markFailed = db.prepare(
      `UPDATE local_activity_logs SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
    )

    for (const id of data.synced) markSynced.run(id)
    for (const { id, reason } of data.errors) markFailed.run(reason, nowIso(), id)
  } catch {
    // Network error — do not increment; will retry next cycle
  }
}
