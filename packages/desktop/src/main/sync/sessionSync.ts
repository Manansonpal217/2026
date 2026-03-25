import { validate as isUuid } from 'uuid'
import { getDb } from '../db/index.js'
import { ensureValidSession } from '../auth/handlers.js'
import { getBackoffMinutes } from './resilience.js'
import { getActiveSession } from '../timer/store.js'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'
const BATCH_SIZE = 100

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
  last_sync_attempt_at: string | null
  created_at: string
}

const nowIso = () => new Date().toISOString()

/** Backend batch API requires RFC-4122 UUIDs; drop anything else so sync still succeeds. */
function apiNullableUuid(value: string | null | undefined): string | null {
  if (value == null) return null
  const t = String(value).trim()
  if (!t) return null
  return isUuid(t) ? t : null
}

/**
 * Sync all unsynced local sessions to the backend.
 * No permanent cap — uses exponential backoff and stale recovery.
 */
export async function syncPendingSessions(): Promise<{
  synced: number
  errors: number
  skipped: number
  rateLimited?: boolean
}> {
  const db = getDb()

  const candidates = db
    .prepare(
      `SELECT * FROM local_sessions
       WHERE synced = 0 AND ended_at IS NOT NULL
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(BATCH_SIZE * 2) as LocalSession[]

  const unsynced = candidates
    .filter((s) => {
      const backoffMin = getBackoffMinutes(s.sync_attempts ?? 0)
      if (!s.last_sync_attempt_at) return true
      const lastAttempt = new Date(s.last_sync_attempt_at).getTime()
      return Date.now() - lastAttempt >= backoffMin * 60 * 1000
    })
    .slice(0, BATCH_SIZE)

  if (unsynced.length === 0) {
    return { synced: 0, errors: 0, skipped: 0 }
  }

  const token = await ensureValidSession().catch(() => null)
  if (!token) {
    return { synced: 0, errors: 0, skipped: unsynced.length }
  }

  const stmtBadSessionId = db.prepare(
    `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
  )
  const invalidIdReason = 'Invalid local session id (expected UUID)'
  const syncable = unsynced.filter((s) => {
    if (isUuid(String(s.id).trim())) return true
    stmtBadSessionId.run(invalidIdReason, nowIso(), s.id)
    return false
  })

  if (syncable.length === 0) {
    return { synced: 0, errors: unsynced.length, skipped: 0 }
  }

  const payload = syncable.map((s) => ({
    id: String(s.id).trim(),
    device_id: s.device_id,
    device_name: s.device_name,
    project_id: apiNullableUuid(s.project_id),
    task_id: apiNullableUuid(s.task_id),
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

    if (res.status === 429) {
      return { synced: 0, errors: 0, skipped: 0, rateLimited: true }
    }

    if (!res.ok) {
      const isTransient = res.status >= 500
      const reason = `HTTP ${res.status}`
      const stmtTransient = db.prepare(
        `UPDATE local_sessions SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
      )
      const stmtPermanent = db.prepare(
        `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
      )
      for (const s of syncable) {
        if (isTransient) stmtTransient.run(nowIso(), reason, s.id)
        else stmtPermanent.run(reason, nowIso(), s.id)
      }
      return { synced: 0, errors: unsynced.length, skipped: 0 }
    }

    responseData = await res.json()
  } catch {
    return { synced: 0, errors: 0, skipped: 0 }
  }

  const markSynced = db.prepare(`UPDATE local_sessions SET synced = 1 WHERE id = ?`)
  const markFailed = db.prepare(
    `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
  )

  for (const { id } of responseData.synced) {
    markSynced.run(id)
  }
  for (const { id, reason } of responseData.errors) {
    markFailed.run(reason, nowIso(), id)
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

  const localId = String(row.id).trim()
  if (!isUuid(localId)) {
    console.warn('[syncRunningSessionToBackend] Local session id is not a valid UUID:', row.id)
    return false
  }

  const token = await ensureValidSession().catch(() => null)
  if (!token) return false

  const payload = {
    id: localId,
    device_id: row.device_id,
    device_name: row.device_name,
    project_id: apiNullableUuid(row.project_id),
    task_id: apiNullableUuid(row.task_id),
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

let lastRunningSessionSyncWarnAt = 0
const RUNNING_SESSION_WARN_INTERVAL_MS = 5 * 60 * 1000

/**
 * Re-register the current open session on the server on each sync tick so a failed
 * start-time sync (network, 5xx, etc.) does not leave the web dashboard empty until stop.
 */
export async function syncActiveRunningSessionIfAny(): Promise<void> {
  const active = getActiveSession()
  if (!active) return
  const ok = await syncRunningSessionToBackend(active.id)
  if (!ok) {
    const now = Date.now()
    if (now - lastRunningSessionSyncWarnAt >= RUNNING_SESSION_WARN_INTERVAL_MS) {
      lastRunningSessionSyncWarnAt = now
      console.warn(
        '[sync] Open session still not on server; check VITE_API_URL matches web NEXT_PUBLIC_API_URL, task/project UUIDs exist in org, and main-process logs for [syncRunningSessionToBackend].'
      )
    }
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
