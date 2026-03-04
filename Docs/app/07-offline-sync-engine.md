# App Module 07 — Offline Mode & Sync Engine

**Platform:** Desktop App (Electron + React)  
**Depends on:** All App modules (central sync orchestrator), Backend Modules 06, 07, 08

---

## Overview

The sync engine is the backbone of local-first data reliability. It continuously monitors network status, processes the local SQLite queue of pending sessions, screenshots, and activity logs, and syncs them to the backend in the correct order. All other modules write to SQLite; this module reads from it and handles all server communication for data persistence.

---

## Local SQLite Encryption (better-sqlite3 + sqlcipher or AES file layer)

> **Security requirement:** The local database stores session data, active URLs, app names, and screenshot file paths — all sensitive. It must be encrypted at rest.

**Stack:** [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) runs in the **Electron main process**. The renderer process never accesses the DB directly — all DB access goes through `ipcMain` handlers.

### Encryption Key Derivation (Node.js + keytar)

```typescript
// src/main/db/key.ts  — runs in Electron main process only
import keytar from 'keytar'
import { randomBytes } from 'crypto'

const SERVICE = 'TrackSync'
const ACCOUNT = 'db_encryption_key'

export async function getDbEncryptionKey(): Promise<string> {
  // Try to load existing key from OS keychain
  const existing = await keytar.getPassword(SERVICE, ACCOUNT)
  if (existing) return existing

  // First run: generate a new 32-byte key, store in keychain
  const key = randomBytes(32).toString('hex')
  await keytar.setPassword(SERVICE, ACCOUNT, key)
  return key
}
```

`keytar` accesses:
- **macOS:** Keychain
- **Windows:** Windows Credential Manager
- **Linux:** libsecret / GNOME Keyring

### Opening the Encrypted Database (better-sqlite3 + SQLCipher)

```typescript
// src/main/db/index.ts  — main process
// npm install better-sqlite3-sqlcipher  (SQLCipher-backed build)

import Database from 'better-sqlite3-sqlcipher'
import { app } from 'electron'
import path from 'path'
import { getDbEncryptionKey } from './key'

let db: Database.Database

export async function openLocalDb(): Promise<Database.Database> {
  const key = await getDbEncryptionKey()
  const dbPath = path.join(app.getPath('userData'), 'local.db')

  db = new Database(dbPath)

  // SQLCipher: must set key before any other operation
  db.pragma(`key = '${key}'`)
  db.pragma('cipher_page_size = 4096')
  db.pragma('kdf_iter = 256000')

  // WAL mode: critical — IPC handlers (main thread) + background sync can both access DB
  // Without WAL, SQLite write lock would block sync during active UI operations
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')   // safe with WAL; ~5x faster than FULL
  db.pragma('foreign_keys = ON')
  db.pragma('cache_size = -64000')    // 64 MB page cache
  db.pragma('temp_store = MEMORY')

  return db
}

// On app quit: checkpoint WAL so all pages are in the main DB file
export function closeDb(): void {
  if (db) {
    db.pragma('wal_checkpoint(FULL)')
    db.close()
  }
}

// Expose to main process lifecycle
app.on('before-quit', closeDb)
```

### IPC — Renderer Never Touches DB Directly

```typescript
// src/main/ipc/db-handlers.ts — all DB IPC handlers live here
import { ipcMain } from 'electron'
import { getDb } from '../db'

ipcMain.handle('db:getSession', (_event, sessionId: string) => {
  return getDb().prepare('SELECT * FROM local_sessions WHERE id = ?').get(sessionId)
})

ipcMain.handle('db:upsertSession', (_event, session) => {
  return getDb().prepare(`
    INSERT INTO local_sessions (id, task_id, started_at, sync_status, ...)
    VALUES (@id, @task_id, @started_at, @sync_status, ...)
    ON CONFLICT(id) DO UPDATE SET ...
  `).run(session)
})
```

```typescript
// src/renderer/api/db.ts — renderer calls via preload bridge
export const db = {
  getSession: (id: string) => window.electron.ipcRenderer.invoke('db:getSession', id),
  upsertSession: (session) => window.electron.ipcRenderer.invoke('db:upsertSession', session),
}
```

> The database file at `%APPDATA%/TrackSync/local.db` (Windows) or `~/Library/Application Support/TrackSync/local.db` (macOS) is fully encrypted. Without the keychain-derived key, it is unreadable binary data.

---

## Responsibilities

1. Detect online/offline state
2. Sync pending `local_sessions` → server `time_sessions`
3. Sync pending `local_screenshots` → S3 + server `screenshots`
4. Sync pending `local_activity_logs` → server `activity_logs`
5. Handle conflicts and deduplication
6. Retry failures with exponential backoff
7. Show sync status indicator in the UI

---

## Network Detection

```typescript
// Check connectivity every 30 seconds
// Also listen to system network events via Electron's net module

async function checkConnectivity(): Promise<boolean> {
  try {
    await fetch('https://api.tracksync.io/health', { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

// On status change: trigger immediate sync if back online
```

---

## Sync Orchestration

```typescript
async function runSyncCycle() {
  if (!isOnline) return

  await syncSessions()       // Step 1: sessions must exist before screenshots
  await syncScreenshots()    // Step 2: requires server_session_id from step 1
  await syncActivityLogs()   // Step 3: requires server_session_id from step 1
}

// Runs every 60 seconds when online
// Triggered immediately when coming back online
setInterval(runSyncCycle, 60_000)
```

---

## Session Sync

```typescript
async function syncSessions() {
  const pending = db.query(`
    SELECT * FROM local_sessions
    WHERE sync_status IN ('pending', 'failed')
    AND status IN ('completed', 'discarded')
    AND retry_count < 10
    ORDER BY started_at ASC
  `)

  for (const session of pending) {
    try {
      const result = await api.post('/app/sessions/sync', session)
      db.run(`
        UPDATE local_sessions
        SET server_session_id = ?, sync_status = 'synced'
        WHERE id = ?
      `, [result.server_id, session.id])
    } catch (err) {
      db.run(`
        UPDATE local_sessions
        SET sync_status = 'failed', retry_count = retry_count + 1,
            last_attempt_at = ?
        WHERE id = ?
      `, [Date.now(), session.id])
    }
  }
}
```

---

## Screenshot Sync

```typescript
async function syncScreenshots() {
  const pending = db.query(`
    SELECT s.*, ls.server_session_id
    FROM local_screenshots s
    JOIN local_sessions ls ON s.session_id = ls.id
    WHERE s.sync_status IN ('pending', 'failed')
    AND s.retry_count < 10
    AND ls.server_session_id IS NOT NULL   -- session must be synced first
    ORDER BY s.captured_at ASC
  `)

  for (const ss of pending) {
    try {
      // Compress image
      // Decrypt + upload in one step — no intermediate plaintext file written to disk
      const imageBuffer = await ipcRenderer.invoke('screenshot:readForUpload', ss.file_path)

      // Upload to backend (which handles S3)
      const result = await api.post('/app/screenshots/upload', {
        session_id: ss.server_session_id,
        file: compressedPath,
        captured_at: ss.captured_at,
        activity_score: ss.activity_score
      })

      // Cleanup
      await ipcRenderer.invoke('screenshot:deleteFile', ss.file_path)

      db.run(`
        UPDATE local_screenshots
        SET sync_status = 'synced', server_screenshot_id = ?
        WHERE id = ?
      `, [result.screenshot_id, ss.id])
    } catch (err) {
      db.run(`
        UPDATE local_screenshots
        SET sync_status = 'failed', retry_count = retry_count + 1,
            last_attempt_at = ?
        WHERE id = ?
      `, [Date.now(), ss.id])
    }
  }
}
```

---

## Activity Log Sync

```typescript
async function syncActivityLogs() {
  const pending = db.query(`
    SELECT al.*, ls.server_session_id
    FROM local_activity_logs al
    JOIN local_sessions ls ON al.session_id = ls.id
    WHERE al.sync_status = 'pending'
    AND ls.server_session_id IS NOT NULL
    ORDER BY al.recorded_at ASC
    LIMIT 100   -- batch to prevent large payloads
  `)

  if (pending.length === 0) return

  try {
    await api.post('/app/activity-logs', { logs: pending })
    const ids = pending.map(l => l.id)
    db.run(`UPDATE local_activity_logs SET sync_status = 'synced' WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  } catch {
    // Mark failed individually on next pass
  }
}
```

---

## Conflict Resolution

| Scenario | Resolution |
|----------|-----------|
| Session already exists on server (duplicate sync) | Server deduplicates by `(user_id, started_at)` — returns existing ID |
| Screenshot uploaded twice | Server deduplicates by `(session_id, captured_at)` — ignores duplicate |
| Activity log duplicate | Server deduplicates by `(session_id, recorded_at)` |
| Server session not found | Re-create session first, then retry dependents |

---

## Retry Backoff Schedule

| `retry_count` | Wait before next attempt |
|---------------|------------------------|
| 0 | Immediate |
| 1 | 30 seconds |
| 2 | 2 minutes |
| 3 | 5 minutes |
| 4–9 | 15 minutes |
| 10+ | Marked `failed` — flagged in sync status UI |

---

## Sync Status UI

```
System tray / settings panel shows:
    ✅ All synced (no pending items)
    🔄 Syncing... (3 items remaining)
    ⚠️  Offline — 12 items queued
    ❌ Sync failed — 2 items need attention [Retry]
```

---

## Local Data Retention Policy

| Data | Kept locally until |
|------|--------------------|
| Synced sessions | 30 days, then cleaned up |
| Synced activity logs | 30 days |
| Synced screenshots | Deleted immediately after S3 upload confirms |
| Failed screenshots | Kept until manually resolved (max 500 MB cap) |
| Cached projects/tasks | Refreshed on TTL, old entries cleaned after 7 days |
