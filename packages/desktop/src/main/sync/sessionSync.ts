import { getDb } from '../db/index.js'
import { ensureValidSession } from '../auth/handlers.js'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'
const BATCH_SIZE = 50

export function getApiBase(): string {
  return API_URL
}

export async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const token = await ensureValidSession().catch(() => null)
  if (!token) return null
  return { Authorization: `Bearer ${token}` }
}

export interface LocalSession {
  id: string
  user_id: string
  org_id: string
  project_id: string | null
  task_id: string | null
  device_id: string
  device_name: string
  started_at: string
  ended_at: string | null
  duration_sec: number
  is_manual: number
  notes: string | null
  synced: number
  sync_attempts: number
  last_sync_error: string | null
  created_at: string
}

/**
 * Sync all unsynced local sessions to the backend.
 * Sessions with >5 failed attempts are skipped (requires manual intervention).
 */
export async function syncPendingSessions(): Promise<{
  synced: number
  errors: number
  skipped: number
}> {
  const db = getDb()

  const unsynced = db
    .prepare(
      `SELECT * FROM local_sessions
       WHERE synced = 0 AND ended_at IS NOT NULL AND sync_attempts < 6
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(BATCH_SIZE) as LocalSession[]

  if (unsynced.length === 0) {
    return { synced: 0, errors: 0, skipped: 0 }
  }

  const token = await ensureValidSession().catch(() => null)
  if (!token) {
    return { synced: 0, errors: 0, skipped: unsynced.length }
  }

  const payload = unsynced.map((s) => ({
    id: s.id,
    device_id: s.device_id,
    device_name: s.device_name,
    project_id: s.project_id || null,
    task_id: s.task_id || null,
    started_at: s.started_at,
    ended_at: s.ended_at,
    duration_sec: s.duration_sec,
    is_manual: Boolean(s.is_manual),
    notes: s.notes,
  }))

  let responseData: { synced: { id: string }[]; errors: { id: string; reason: string }[] }

  try {
    const res = await fetch(`${API_URL}/v1/sessions/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessions: payload }),
    })

    if (!res.ok) {
      // Mark all as failed
      const reason = `HTTP ${res.status}`
      const stmt = db.prepare(
        `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`
      )
      for (const s of unsynced) {
        stmt.run(reason, s.id)
      }
      return { synced: 0, errors: unsynced.length, skipped: 0 }
    }

    responseData = await res.json()
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Network error'
    const stmt = db.prepare(
      `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`
    )
    for (const s of unsynced) {
      stmt.run(reason, s.id)
    }
    return { synced: 0, errors: unsynced.length, skipped: 0 }
  }

  const markSynced = db.prepare(`UPDATE local_sessions SET synced = 1 WHERE id = ?`)
  const markFailed = db.prepare(
    `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`
  )

  for (const { id } of responseData.synced) {
    markSynced.run(id)
  }
  for (const { id, reason } of responseData.errors) {
    markFailed.run(reason, id)
  }

  return {
    synced: responseData.synced.length,
    errors: responseData.errors.length,
    skipped: 0,
  }
}

/**
 * Sync a running session to the backend immediately when the timer starts.
 * This creates the session in Postgres so screenshot uploads can succeed
 * (upload-url endpoint requires the session to exist).
 * Does NOT mark local session as synced — that happens when the timer stops.
 */
export async function syncRunningSessionToBackend(sessionId: string): Promise<boolean> {
  const db = getDb()
  const row = db
    .prepare(`SELECT * FROM local_sessions WHERE id = ? AND ended_at IS NULL LIMIT 1`)
    .get(sessionId) as LocalSession | undefined

  if (!row) return false

  const token = await ensureValidSession().catch(() => null)
  if (!token) return false

  const payload = {
    id: row.id,
    device_id: row.device_id,
    device_name: row.device_name,
    project_id: row.project_id || null,
    task_id: row.task_id || null,
    started_at: row.started_at,
    ended_at: null as string | null,
    duration_sec: 0,
    is_manual: Boolean(row.is_manual),
    notes: row.notes,
  }

  try {
    const res = await fetch(`${API_URL}/v1/sessions/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessions: [payload] }),
    })

    if (!res.ok) {
      console.warn('[syncRunningSessionToBackend] Failed:', res.status, await res.text())
      return false
    }

    const data = (await res.json()) as {
      synced?: { id: string }[]
      errors?: { id: string; reason: string }[]
    }
    if (data.errors?.length) {
      console.warn('[syncRunningSessionToBackend] Backend rejected:', data.errors)
      return false
    }
    return true
  } catch (err) {
    console.warn('[syncRunningSessionToBackend] Error:', err)
    return false
  }
}

/** Get count of pending (unsynced) sessions. */
export function getPendingSyncCount(): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM local_sessions WHERE synced = 0 AND ended_at IS NOT NULL`
    )
    .get() as { count: number }
  return row.count
}
