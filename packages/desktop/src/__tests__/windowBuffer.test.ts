import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'

// Test the window buffer's flush logic by simulating it in isolation
// (without Electron's app.getPath deps)

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS local_activity_logs (
    id                TEXT    PRIMARY KEY,
    session_id        TEXT    NOT NULL,
    window_start      TEXT    NOT NULL,
    window_end        TEXT    NOT NULL,
    keyboard_events   INTEGER NOT NULL DEFAULT 0,
    mouse_clicks      INTEGER NOT NULL DEFAULT 0,
    mouse_distance_px INTEGER NOT NULL DEFAULT 0,
    active_app        TEXT,
    activity_score    REAL    NOT NULL DEFAULT 0,
    synced            INTEGER NOT NULL DEFAULT 0,
    sync_attempts     INTEGER NOT NULL DEFAULT 0,
    last_sync_error   TEXT,
    created_at        TEXT    NOT NULL
  );
`

function makeFlushFn(db: Database.Database) {
  return function flush(
    sessionId: string,
    windowStart: Date,
    windowEnd: Date,
    keyboardEvents: number,
    mouseClicks: number,
    mouseDistancePx: number,
    activeApp: string | null,
    activityScore: number,
  ) {
    const id = `test-${Math.random().toString(36).slice(2)}`
    db.prepare(`
      INSERT OR IGNORE INTO local_activity_logs
        (id, session_id, window_start, window_end, keyboard_events, mouse_clicks,
         mouse_distance_px, active_app, activity_score, synced, sync_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      id,
      sessionId,
      windowStart.toISOString(),
      windowEnd.toISOString(),
      keyboardEvents,
      mouseClicks,
      mouseDistancePx,
      activeApp,
      activityScore,
      new Date().toISOString(),
    )
    return id
  }
}

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.exec(SCHEMA)
})

afterEach(() => {
  testDb.close()
})

describe('windowBuffer flush → local_activity_logs', () => {
  it('writes a SQLite row with correct data', () => {
    const flush = makeFlushFn(testDb)
    const start = new Date('2024-01-15T10:00:00.000Z')
    const end = new Date('2024-01-15T10:10:00.000Z')

    flush('session-1', start, end, 150, 30, 8000, 'VSCode', 72)

    const rows = testDb
      .prepare('SELECT * FROM local_activity_logs WHERE session_id = ?')
      .all('session-1') as Array<{
      keyboard_events: number
      mouse_clicks: number
      activity_score: number
      synced: number
      active_app: string
    }>

    expect(rows).toHaveLength(1)
    expect(rows[0].keyboard_events).toBe(150)
    expect(rows[0].mouse_clicks).toBe(30)
    expect(rows[0].activity_score).toBe(72)
    expect(rows[0].synced).toBe(0)
    expect(rows[0].active_app).toBe('VSCode')
  })

  it('multiple flushes create separate rows', () => {
    const flush = makeFlushFn(testDb)
    const base = new Date('2024-01-15T10:00:00.000Z')

    for (let i = 0; i < 3; i++) {
      const start = new Date(base.getTime() + i * 10 * 60 * 1000)
      const end = new Date(base.getTime() + (i + 1) * 10 * 60 * 1000)
      flush('session-2', start, end, 100, 20, 5000, null, 60)
    }

    const count = (
      testDb.prepare('SELECT COUNT(*) as c FROM local_activity_logs').get() as { c: number }
    ).c
    expect(count).toBe(3)
  })

  it('handles null active_app gracefully', () => {
    const flush = makeFlushFn(testDb)
    const start = new Date()
    const end = new Date(start.getTime() + 60000)

    flush('session-3', start, end, 0, 0, 0, null, 0)

    const row = testDb
      .prepare('SELECT active_app FROM local_activity_logs WHERE session_id = ?')
      .get('session-3') as { active_app: string | null }

    expect(row.active_app).toBeNull()
  })
})
