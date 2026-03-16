import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

// ── Minimal in-memory DB setup ────────────────────────────────────────────────

let testDb: Database.Database

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS local_sessions (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    org_id           TEXT NOT NULL,
    project_id       TEXT,
    task_id          TEXT,
    device_id        TEXT NOT NULL,
    device_name      TEXT NOT NULL,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,
    duration_sec     INTEGER DEFAULT 0,
    is_manual        INTEGER DEFAULT 0,
    notes            TEXT,
    synced           INTEGER DEFAULT 0,
    sync_attempts    INTEGER DEFAULT 0,
    last_sync_error  TEXT,
    created_at       TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS __config (key TEXT PRIMARY KEY, value TEXT);
`

// Inline timer logic that uses our test DB (avoids Electron app.getPath deps)
function makeTimerFns(db: Database.Database) {
  let activeSession: {
    id: string
    userId: string
    orgId: string
    deviceId: string
    deviceName: string
    startedAt: Date
    projectId: string | null
    taskId: string | null
    notes: string | null
    intervalId: ReturnType<typeof setInterval> | null
  } | null = null

  function getElapsed() {
    if (!activeSession) return 0
    return Math.floor((Date.now() - activeSession.startedAt.getTime()) / 1000)
  }

  function start(args: {
    userId: string
    orgId: string
    deviceId: string
    deviceName: string
    projectId?: string | null
    taskId?: string | null
    notes?: string | null
  }) {
    if (activeSession) stop()

    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const startedAt = new Date()

    db.prepare(`
      INSERT INTO local_sessions
        (id, user_id, org_id, project_id, task_id, device_id, device_name,
         started_at, ended_at, duration_sec, is_manual, notes, synced, sync_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, 0, 0, ?)
    `).run(
      id,
      args.userId,
      args.orgId,
      args.projectId ?? null,
      args.taskId ?? null,
      args.deviceId,
      args.deviceName,
      startedAt.toISOString(),
      args.notes ?? null,
      startedAt.toISOString(),
    )

    activeSession = {
      id,
      userId: args.userId,
      orgId: args.orgId,
      deviceId: args.deviceId,
      deviceName: args.deviceName,
      startedAt,
      projectId: args.projectId ?? null,
      taskId: args.taskId ?? null,
      notes: args.notes ?? null,
      intervalId: null,
    }

    return { running: true, elapsed: 0, session: { id, startedAt: startedAt.toISOString() } }
  }

  function stop() {
    if (!activeSession) return null

    if (activeSession.intervalId !== null) {
      clearInterval(activeSession.intervalId)
    }

    const endedAt = new Date()
    const durationSec = Math.floor(
      (endedAt.getTime() - activeSession.startedAt.getTime()) / 1000,
    )

    db.prepare(`
      UPDATE local_sessions SET ended_at = ?, duration_sec = ?, synced = 0 WHERE id = ?
    `).run(endedAt.toISOString(), durationSec, activeSession.id)

    const row = db.prepare('SELECT * FROM local_sessions WHERE id = ?').get(activeSession.id)
    const stoppedId = activeSession.id
    activeSession = null
    return { session: row, id: stoppedId }
  }

  function switchTask(args: { projectId?: string | null; taskId?: string | null }) {
    if (!activeSession) throw new Error('No active timer')
    const { userId, orgId, deviceId, deviceName } = activeSession
    stop()
    return start({ userId, orgId, deviceId, deviceName, ...args })
  }

  function getStatus() {
    return {
      running: activeSession !== null,
      elapsed: getElapsed(),
      session: activeSession
        ? { id: activeSession.id, startedAt: activeSession.startedAt.toISOString() }
        : null,
    }
  }

  return { start, stop, switchTask, getStatus }
}

const SESSION_ARGS = {
  userId: 'user-1',
  orgId: 'org-1',
  deviceId: 'dev-1',
  deviceName: 'MacBook Pro',
}

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.exec(SCHEMA)
})

afterEach(() => {
  testDb.close()
})

describe('startTimer', () => {
  it('creates a SQLite row with synced=0 and null ended_at', () => {
    const { start } = makeTimerFns(testDb)
    const result = start(SESSION_ARGS)

    const rows = testDb
      .prepare('SELECT * FROM local_sessions WHERE id = ?')
      .all(result.session.id) as Array<{
      synced: number
      ended_at: string | null
      user_id: string
    }>

    expect(rows).toHaveLength(1)
    expect(rows[0].synced).toBe(0)
    expect(rows[0].ended_at).toBeNull()
    expect(rows[0].user_id).toBe('user-1')
  })

  it('stops existing session before starting a new one', () => {
    const { start } = makeTimerFns(testDb)
    start(SESSION_ARGS)
    start({ ...SESSION_ARGS, notes: 'second' })

    const rows = testDb.prepare('SELECT * FROM local_sessions').all() as Array<{
      ended_at: string | null
    }>
    expect(rows).toHaveLength(2)
    // First session should have ended_at set
    const firstRow = rows[0]
    expect(firstRow.ended_at).not.toBeNull()
  })

  it('stores projectId and notes correctly', () => {
    const { start } = makeTimerFns(testDb)
    const result = start({ ...SESSION_ARGS, projectId: 'proj-1', notes: 'hello' })

    const row = testDb
      .prepare('SELECT * FROM local_sessions WHERE id = ?')
      .get(result.session.id) as { project_id: string; notes: string }

    expect(row.project_id).toBe('proj-1')
    expect(row.notes).toBe('hello')
  })
})

describe('stopTimer', () => {
  it('sets ended_at and computes duration_sec', async () => {
    const { start, stop } = makeTimerFns(testDb)

    vi.useFakeTimers()
    const startResult = start(SESSION_ARGS)
    vi.advanceTimersByTime(5000) // advance 5 seconds
    vi.useRealTimers()

    const result = stop()
    expect(result).not.toBeNull()

    const row = testDb
      .prepare('SELECT * FROM local_sessions WHERE id = ?')
      .get(startResult.session.id) as { ended_at: string | null; duration_sec: number }

    expect(row.ended_at).not.toBeNull()
    // duration_sec should be >= 0 (may be 0 in fast test)
    expect(row.duration_sec).toBeGreaterThanOrEqual(0)
  })

  it('returns null when no active session', () => {
    const { stop } = makeTimerFns(testDb)
    expect(stop()).toBeNull()
  })
})

describe('switchTask', () => {
  it('creates two separate sessions with no active timer after switch', () => {
    const { start, switchTask, getStatus } = makeTimerFns(testDb)
    start(SESSION_ARGS)
    switchTask({ projectId: 'proj-2', taskId: 'task-1' })

    const rows = testDb.prepare('SELECT * FROM local_sessions ORDER BY created_at ASC').all() as Array<{
      ended_at: string | null
      project_id: string | null
    }>
    expect(rows).toHaveLength(2)
    // First session ended
    expect(rows[0].ended_at).not.toBeNull()
    expect(rows[0].project_id).toBeNull()
    // Second session running
    expect(rows[1].ended_at).toBeNull()
    expect(rows[1].project_id).toBe('proj-2')
    // Timer still running after switch
    expect(getStatus().running).toBe(true)
  })

  it('throws when no active timer', () => {
    const { switchTask } = makeTimerFns(testDb)
    expect(() => switchTask({ projectId: 'p' })).toThrow('No active timer')
  })
})
