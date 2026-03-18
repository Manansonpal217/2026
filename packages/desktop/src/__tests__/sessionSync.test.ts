import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

// ── In-memory DB ─────────────────────────────────────────────────────────────

let testDb: Database.Database

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS local_sessions (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    org_id                TEXT NOT NULL,
    project_id            TEXT,
    task_id               TEXT,
    device_id             TEXT NOT NULL,
    device_name           TEXT NOT NULL,
    started_at            TEXT NOT NULL,
    ended_at              TEXT,
    duration_sec          INTEGER DEFAULT 0,
    is_manual             INTEGER DEFAULT 0,
    notes                 TEXT,
    synced                INTEGER DEFAULT 0,
    sync_attempts         INTEGER DEFAULT 0,
    last_sync_error       TEXT,
    last_sync_attempt_at  TEXT,
    created_at            TEXT NOT NULL
  );
`

function insertSession(
  db: Database.Database,
  overrides: Partial<{
    id: string
    ended_at: string | null
    synced: number
    sync_attempts: number
    last_sync_attempt_at: string | null
  }> = {}
) {
  const id = overrides.id ?? `sess-${Math.random().toString(36).slice(2)}`
  const now = new Date().toISOString()
  db.prepare(
    `
    INSERT INTO local_sessions
      (id, user_id, org_id, project_id, task_id, device_id, device_name,
       started_at, ended_at, duration_sec, is_manual, notes, synced, sync_attempts, last_sync_attempt_at, created_at)
    VALUES (?, 'u1', 'o1', NULL, NULL, 'dev1', 'MacBook', ?, ?, 60, 0, NULL, ?, ?, ?, ?)
  `
  ).run(
    id,
    now,
    overrides.ended_at !== undefined ? overrides.ended_at : now,
    overrides.synced ?? 0,
    overrides.sync_attempts ?? 0,
    overrides.last_sync_attempt_at ?? null,
    now
  )
  return id
}

// ── Inline syncPendingSessions logic for testing (matches resilience plan) ─────

type BatchResponse = {
  synced: { id: string }[]
  errors: { id: string; reason: string }[]
}

async function syncPendingSessions(
  db: Database.Database,
  fetchFn: (
    url: string,
    init: RequestInit
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<BatchResponse> }>
): Promise<{ synced: number; errors: number; skipped: number; rateLimited?: boolean }> {
  const BATCH_SIZE = 100
  const nowIso = () => new Date().toISOString()

  const candidates = db
    .prepare(
      `SELECT * FROM local_sessions
       WHERE synced = 0 AND ended_at IS NOT NULL
       ORDER BY created_at ASC LIMIT ?`
    )
    .all(BATCH_SIZE * 2) as Array<{
    id: string
    device_id: string
    device_name: string
    sync_attempts: number
    last_sync_attempt_at: string | null
  }>

  const unsynced = candidates
    .filter((s) => {
      const backoffMin = Math.min(2 ** Math.min(s.sync_attempts ?? 0, 5), 60)
      if (!s.last_sync_attempt_at) return true
      const lastAttempt = new Date(s.last_sync_attempt_at).getTime()
      return Date.now() - lastAttempt >= backoffMin * 60 * 1000
    })
    .slice(0, BATCH_SIZE)

  if (unsynced.length === 0) return { synced: 0, errors: 0, skipped: 0 }

  const res = await fetchFn('/v1/sessions/batch', {
    method: 'POST',
    body: JSON.stringify({ sessions: unsynced }),
  })

  if (res.status === 429) return { synced: 0, errors: 0, skipped: 0, rateLimited: true }

  if (!res.ok) {
    const isTransient = res.status >= 500
    const reason = `HTTP ${res.status}`
    if (isTransient) {
      const stmt = db.prepare(
        `UPDATE local_sessions SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
      )
      for (const s of unsynced) stmt.run(nowIso(), reason, s.id)
    } else {
      const stmt = db.prepare(
        `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
      )
      for (const s of unsynced) stmt.run(reason, nowIso(), s.id)
    }
    return { synced: 0, errors: unsynced.length, skipped: 0 }
  }

  const data = await res.json()
  const markSynced = db.prepare(`UPDATE local_sessions SET synced = 1 WHERE id = ?`)
  const markFailed = db.prepare(
    `UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
  )

  for (const { id } of data.synced) markSynced.run(id)
  for (const { id, reason } of data.errors) markFailed.run(reason, nowIso(), id)

  return { synced: data.synced.length, errors: data.errors.length, skipped: 0 }
}

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.exec(SCHEMA)
})

afterEach(() => {
  testDb.close()
  vi.restoreAllMocks()
})

describe('syncPendingSessions', () => {
  it('sends unsynced sessions in a batch and marks them synced', async () => {
    const id1 = insertSession(testDb)
    const id2 = insertSession(testDb)

    let capturedBody: { sessions: Array<{ id: string }> } = { sessions: [] }
    const mockFetch = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as typeof capturedBody
      return {
        ok: true,
        status: 200,
        json: async () => ({ synced: [{ id: id1 }, { id: id2 }], errors: [] }),
      }
    })

    const result = await syncPendingSessions(testDb, mockFetch)

    expect(result.synced).toBe(2)
    expect(result.errors).toBe(0)
    expect(capturedBody?.sessions).toHaveLength(2)

    const rows = testDb.prepare('SELECT synced FROM local_sessions').all() as Array<{
      synced: number
    }>
    expect(rows.every((r) => r.synced === 1)).toBe(true)
  })

  it('includes sessions with 6+ attempts when past backoff (no permanent cap)', async () => {
    const id = insertSession(testDb, {
      sync_attempts: 6,
      last_sync_attempt_at: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
    })
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ synced: [{ id }], errors: [] }),
    }))

    const result = await syncPendingSessions(testDb, mockFetch)
    expect(result.synced).toBe(1)
    expect(mockFetch).toHaveBeenCalled()
  })

  it('does not increment sync_attempts on 5xx (transient)', async () => {
    const id = insertSession(testDb)
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ synced: [], errors: [] }),
    }))

    const result = await syncPendingSessions(testDb, mockFetch)
    expect(result.errors).toBe(1)

    const row = testDb
      .prepare(
        'SELECT sync_attempts, last_sync_error, last_sync_attempt_at, synced FROM local_sessions WHERE id = ?'
      )
      .get(id) as {
      sync_attempts: number
      last_sync_error: string
      last_sync_attempt_at: string
      synced: number
    }

    expect(row.sync_attempts).toBe(0)
    expect(row.last_sync_error).toBe('HTTP 503')
    expect(row.last_sync_attempt_at).toBeTruthy()
    expect(row.synced).toBe(0)
  })

  it('increments sync_attempts on 4xx (permanent)', async () => {
    const id = insertSession(testDb)
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ synced: [], errors: [] }),
    }))

    const result = await syncPendingSessions(testDb, mockFetch)
    expect(result.errors).toBe(1)

    const row = testDb
      .prepare('SELECT sync_attempts, last_sync_error, synced FROM local_sessions WHERE id = ?')
      .get(id) as { sync_attempts: number; last_sync_error: string; synced: number }

    expect(row.sync_attempts).toBe(1)
    expect(row.last_sync_error).toBe('HTTP 400')
    expect(row.synced).toBe(0)
  })

  it('returns rateLimited on 429 without updating DB', async () => {
    const id = insertSession(testDb)
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ synced: [], errors: [] }),
    }))

    const result = await syncPendingSessions(testDb, mockFetch)
    expect(result.rateLimited).toBe(true)

    const row = testDb
      .prepare('SELECT sync_attempts, last_sync_error FROM local_sessions WHERE id = ?')
      .get(id) as { sync_attempts: number; last_sync_error: string | null }

    expect(row.sync_attempts).toBe(0)
    expect(row.last_sync_error).toBeNull()
  })

  it('handles partial server errors — syncs some, fails others', async () => {
    const id1 = insertSession(testDb)
    const id2 = insertSession(testDb)

    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        synced: [{ id: id1 }],
        errors: [{ id: id2, reason: 'invalid session' }],
      }),
    }))

    const result = await syncPendingSessions(testDb, mockFetch)
    expect(result.synced).toBe(1)
    expect(result.errors).toBe(1)

    const r1 = testDb.prepare('SELECT synced FROM local_sessions WHERE id = ?').get(id1) as {
      synced: number
    }
    const r2 = testDb
      .prepare('SELECT sync_attempts, last_sync_error FROM local_sessions WHERE id = ?')
      .get(id2) as { sync_attempts: number; last_sync_error: string }

    expect(r1.synced).toBe(1)
    expect(r2.sync_attempts).toBe(1)
    expect(r2.last_sync_error).toBe('invalid session')
  })

  it('does nothing when all sessions are already synced', async () => {
    insertSession(testDb, { synced: 1 })
    const mockFetch = vi.fn()
    const result = await syncPendingSessions(testDb, mockFetch)
    expect(result.synced).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skips sessions with no ended_at (still running)', async () => {
    insertSession(testDb, { ended_at: null })
    const mockFetch = vi.fn()
    await syncPendingSessions(testDb, mockFetch)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
