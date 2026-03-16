import Database from 'better-sqlite3-multiple-ciphers'
import { app } from 'electron'
import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'
import { getDbEncryptionKey } from './key.js'

let db: Database.Database | null = null

// Migrations embedded as fallback for dev mode where the migrations folder
// may not exist alongside the compiled output (electron-vite builds to dist/).
const EMBEDDED_MIGRATIONS: Record<string, string> = {
  '001_initial.sql': `
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
    CREATE INDEX IF NOT EXISTS idx_local_sessions_synced  ON local_sessions(synced);
    CREATE INDEX IF NOT EXISTS idx_local_sessions_user    ON local_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_local_sessions_started ON local_sessions(started_at DESC);
  `,
  '002_screenshots.sql': `
    CREATE TABLE IF NOT EXISTS local_screenshots (
      id              TEXT    PRIMARY KEY,
      session_id      TEXT    NOT NULL,
      local_path      TEXT    NOT NULL,
      taken_at        TEXT    NOT NULL,
      activity_score  REAL    NOT NULL DEFAULT 0,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      synced          INTEGER NOT NULL DEFAULT 0,
      sync_attempts   INTEGER NOT NULL DEFAULT 0,
      last_sync_error TEXT,
      created_at      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_screenshots_session ON local_screenshots (session_id);
    CREATE INDEX IF NOT EXISTS idx_local_screenshots_synced  ON local_screenshots (synced, taken_at);
    CREATE TABLE IF NOT EXISTS local_activity_logs (
      id                TEXT    PRIMARY KEY,
      session_id        TEXT    NOT NULL,
      window_start      TEXT    NOT NULL,
      window_end        TEXT    NOT NULL,
      keyboard_events   INTEGER NOT NULL DEFAULT 0,
      mouse_clicks      INTEGER NOT NULL DEFAULT 0,
      mouse_distance_px INTEGER NOT NULL DEFAULT 0,
      active_app        TEXT,
      active_url        TEXT,
      activity_score    REAL    NOT NULL DEFAULT 0,
      synced            INTEGER NOT NULL DEFAULT 0,
      sync_attempts     INTEGER NOT NULL DEFAULT 0,
      last_sync_error   TEXT,
      created_at        TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_activity_session ON local_activity_logs (session_id);
    CREATE INDEX IF NOT EXISTS idx_local_activity_synced  ON local_activity_logs (synced, window_start);
  `,
}

/** Open the local SQLite database and run all pending migrations. */
export async function openDb(): Promise<void> {
  const key = await getDbEncryptionKey()
  const dbPath = join(app.getPath('userData'), 'local.db')
  db = new Database(dbPath)
  // Apply SQLCipher key — must be done before any other operations
  db.pragma(`key = '${key}'`)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
}

/** Return the open database; throws if not yet initialized. */
export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call openDb() first')
  return db
}

/** Close the database (call before app quit). */
export function closeDb(): void {
  db?.close()
  db = null
}

// ── Migration runner ─────────────────────────────────────────────────────────

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      version    INTEGER PRIMARY KEY,
      filename   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    (database.prepare('SELECT filename FROM __migrations').all() as { filename: string }[]).map(
      (r) => r.filename,
    ),
  )

  // Load migrations: try disk first, then merge with embedded to ensure all tables exist
  let fileEntries: Array<{ filename: string; sql: string }> = []
  try {
    const migrationsDir = join(__dirname, 'migrations')
    fileEntries = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((filename) => ({
        filename,
        sql: readFileSync(join(migrationsDir, filename), 'utf-8'),
      }))
  } catch {
    // Migrations folder not found (common in dev)
  }

  // Merge embedded migrations — ensures local_activity_logs etc. exist even if disk is incomplete
  const byFilename = new Map(fileEntries.map((e) => [e.filename, e]))
  for (const [filename, sql] of Object.entries(EMBEDDED_MIGRATIONS)) {
    if (!byFilename.has(filename)) {
      byFilename.set(filename, { filename, sql })
    }
  }
  fileEntries = Array.from(byFilename.values()).sort((a, b) => a.filename.localeCompare(b.filename))

  for (const { filename, sql } of fileEntries) {
    if (applied.has(filename)) continue

    database.exec(sql)

    const version = parseInt(filename.split('_')[0], 10)
    database
      .prepare('INSERT INTO __migrations (version, filename, applied_at) VALUES (?, ?, ?)')
      .run(isNaN(version) ? fileEntries.indexOf({ filename, sql }) + 1 : version, filename, new Date().toISOString())
  }
}
