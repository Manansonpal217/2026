# Phase 2 — Time Tracking & SQLite Sync Engine (Week 6–8)

## Goal

An employee can start and stop a timer in the Desktop App, have sessions persisted locally in an encrypted SQLite database, and have those sessions reliably synced to the PostgreSQL backend — including when offline. The sync engine retries failed syncs with exponential backoff. Sessions are associated with projects and tasks.

---

## Prerequisites

- Phase 1 complete: JWT authentication works end-to-end
- `better-sqlite3-sqlcipher` buildable on target platforms (run `pnpm rebuild`)
- `keytar` returns a valid encryption key (or `DB_ENCRYPTION_KEY` env var in dev)
- Backend: `User`, `Organization` tables exist in PostgreSQL

---

## Key Packages to Install

### Desktop
```bash
pnpm add better-sqlite3-sqlcipher uuid
pnpm add -D @types/uuid
```

### Backend
```bash
pnpm add zod                     # request body validation
pnpm add @fastify/multipart      # for future file uploads (install now)
```

---

## Database Migrations

### PostgreSQL (Prisma)

```prisma
model Project {
  id          String   @id @default(uuid())
  org_id      String
  name        String
  color       String   @default("#6366f1")
  archived    Boolean  @default(false)
  budget_hours Float?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  organization Organization  @relation(fields: [org_id], references: [id])
  tasks        Task[]
  time_sessions TimeSession[]
}

model Task {
  id          String   @id @default(uuid())
  project_id  String
  org_id      String
  name        String
  status      String   @default("open")    // open | in_progress | closed
  external_id String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  project      Project       @relation(fields: [project_id], references: [id])
  time_sessions TimeSession[]
}

model TimeSession {
  id           String    @id @default(uuid())
  user_id      String
  org_id       String
  project_id   String?
  task_id      String?
  device_id    String
  device_name  String
  started_at   DateTime
  ended_at     DateTime?
  duration_sec Int       @default(0)
  is_manual    Boolean   @default(false)
  notes        String?
  approval_status String @default("pending")   // pending | approved | rejected
  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt

  user         User     @relation(fields: [user_id], references: [id])
  project      Project? @relation(fields: [project_id], references: [id])
  task         Task?    @relation(fields: [task_id], references: [id])

  @@unique([user_id, device_id, started_at])
}

// Critical indexes
// @@index([user_id, started_at])
// @@index([org_id, started_at])
// @@index([project_id, started_at])
```

Run:
```bash
pnpm prisma migrate dev --name phase-02-time-tracking
```

### Local SQLite Schema (created by `better-sqlite3` on first run)

```sql
CREATE TABLE IF NOT EXISTS local_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  org_id      TEXT NOT NULL,
  project_id  TEXT,
  task_id     TEXT,
  device_id   TEXT NOT NULL,
  device_name TEXT NOT NULL,
  started_at  TEXT NOT NULL,   -- ISO 8601
  ended_at    TEXT,
  duration_sec INTEGER DEFAULT 0,
  is_manual   INTEGER DEFAULT 0,
  notes       TEXT,
  synced      INTEGER DEFAULT 0,   -- 0 = pending, 1 = synced
  sync_attempts INTEGER DEFAULT 0,
  last_sync_error TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_sessions_synced ON local_sessions(synced);
CREATE INDEX IF NOT EXISTS idx_local_sessions_user ON local_sessions(user_id);
```

---

## Files to Create

| File | Description |
|------|------------|
| `src/main/db/index.ts` | Open SQLite with SQLCipher + WAL mode |
| `src/main/db/key.ts` | `getDbEncryptionKey()` via keytar |
| `src/main/db/migrations/` | SQLite migration runner |
| `src/main/db/migrations/001_initial.sql` | `local_sessions` DDL |
| `src/main/timer/index.ts` | `startTimer`, `stopTimer`, `getElapsed`, `tickTimer` |
| `src/main/timer/store.ts` | In-memory active session state |
| `src/main/sync/sessionSync.ts` | Read unsynced sessions, POST to backend |
| `src/main/sync/scheduler.ts` | Sync every 30s + on network restore |
| `src/renderer/pages/Timer.tsx` | Main timer UI |
| `src/renderer/components/ProjectPicker.tsx` | Project/task selector |
| `src/renderer/stores/timerStore.ts` | Zustand store |
| `src/routes/sessions/create.ts` | Backend: `POST /v1/sessions/batch` |
| `src/routes/sessions/update.ts` | Backend: `PATCH /v1/sessions/:id` |
| `src/routes/sessions/list.ts` | Backend: `GET /v1/sessions` |
| `src/routes/projects/index.ts` | Backend: CRUD for projects |
| `src/routes/tasks/index.ts` | Backend: CRUD for tasks |

---

## Backend Tasks

### Projects API

- [ ] `POST /v1/projects`
  ```
  Request:  { name, color?, budget_hours? }
  Response: { project }
  Auth: admin+
  ```

- [ ] `GET /v1/projects`
  ```
  Query:    ?page=1&limit=50&archived=false
  Response: { projects: [...], total }
  Auth: any authenticated user
  ```

- [ ] `PATCH /v1/projects/:id`
  ```
  Request:  { name?, color?, archived?, budget_hours? }
  Response: { project }
  Auth: admin+
  ```

- [ ] `DELETE /v1/projects/:id` — soft delete (set `archived: true`)

### Tasks API

- [ ] `POST /v1/projects/:projectId/tasks`
  ```
  Request:  { name, status? }
  Response: { task }
  ```

- [ ] `GET /v1/projects/:projectId/tasks`
  ```
  Response: { tasks: [...] }
  ```

- [ ] `PATCH /v1/tasks/:id`
  ```
  Request:  { name?, status? }
  Response: { task }
  ```

### Sessions API

- [ ] `POST /v1/sessions/batch` — **primary sync endpoint**
  ```
  Request:
  {
    sessions: [
      {
        id: string,           // local UUID
        device_id: string,
        device_name: string,
        project_id?: string,
        task_id?: string,
        started_at: string,   // ISO 8601
        ended_at?: string,
        duration_sec: number,
        is_manual: boolean,
        notes?: string
      }
    ]
  }

  Response:
  {
    synced: [{ id, server_id }],
    errors: [{ id, reason }]
  }
  ```
  - Upsert with `ON CONFLICT(user_id, device_id, started_at) DO UPDATE`
  - Validate: `ended_at > started_at`, `duration_sec > 0`
  - Validate: `project_id` and `task_id` belong to caller's org (prevent IDOR)
  - Rate limit: 100 sessions per batch, max 10 requests/min

- [ ] `GET /v1/sessions`
  ```
  Query:    ?from=ISO&to=ISO&user_id=&project_id=&page=1&limit=50
  Response: { sessions: [...], total, total_seconds }
  Auth: Employee sees own sessions only; Manager+ can filter by user_id
  ```

- [ ] `PATCH /v1/sessions/:id`
  ```
  Request:  { notes?, project_id?, task_id? }
  Response: { session }
  Note: Employees can only edit their own sessions; cannot change started_at/ended_at
  ```

---

## Desktop App Tasks

### SQLite Database (`src/main/db/index.ts`)

- [ ] Open database:
  ```typescript
  import Database from 'better-sqlite3-sqlcipher'
  import { app } from 'electron'
  import path from 'path'
  import { getDbEncryptionKey } from './key'

  let db: Database.Database

  export async function openDb(): Promise<void> {
    const key = await getDbEncryptionKey()
    const dbPath = path.join(app.getPath('userData'), 'local.db')
    db = new Database(dbPath)
    db.pragma(`key = '${key}'`)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }

  export function getDb(): Database.Database {
    if (!db) throw new Error('DB not initialized')
    return db
  }

  export function closeDb(): void {
    db?.close()
  }
  ```

- [ ] `app.on('before-quit', closeDb)` in `src/main/index.ts`

### Migration Runner (`src/main/db/migrations/`)

- [ ] Simple migration runner — read all `.sql` files in `migrations/`, track applied versions in `__migrations` table
- [ ] `001_initial.sql` — creates `local_sessions` table + indexes

### Timer Engine (`src/main/timer/index.ts`)

- [ ] In-memory state:
  ```typescript
  interface ActiveSession {
    id: string
    startedAt: Date
    projectId: string | null
    taskId: string | null
    notes: string | null
    intervalId: NodeJS.Timeout | null
  }
  let activeSession: ActiveSession | null = null
  ```

- [ ] `startTimer({ projectId, taskId, notes })`:
  1. Generate `id = uuidv4()`
  2. Write row to `local_sessions` with `synced = 0`, `ended_at = null`
  3. Set `setInterval` to tick every second → emit `ipcMain` event `'timer:tick'` with elapsed seconds
  4. Store `activeSession`

- [ ] `stopTimer()`:
  1. Clear interval
  2. Set `ended_at = now()`, `duration_sec = elapsed`
  3. Update SQLite row
  4. Trigger immediate sync attempt
  5. Return `{ session }`

- [ ] `switchTask({ projectId, taskId })`:
  1. `stopTimer()` (saves current session)
  2. `startTimer({ projectId, taskId })` (new session starts immediately)

### IPC Handlers

- [ ] `ipcMain.handle('timer:start', (_, args) => startTimer(args))`
- [ ] `ipcMain.handle('timer:stop', () => stopTimer())`
- [ ] `ipcMain.handle('timer:switch-task', (_, args) => switchTask(args))`
- [ ] `ipcMain.handle('timer:status', () => getTimerStatus())` → `{ running, elapsed, session }`
- [ ] `ipcMain.handle('projects:list', async () => { ... })` → fetch from backend (cache 5 min in memory)
- [ ] `ipcMain.handle('sessions:list-local', () => { ... })` → query local SQLite for today's sessions

### Sync Engine (`src/main/sync/sessionSync.ts`)

- [ ] `syncPendingSessions()`:
  ```typescript
  const db = getDb()
  const unsyncedSessions = db.prepare(
    `SELECT * FROM local_sessions WHERE synced = 0 ORDER BY created_at ASC LIMIT 50`
  ).all()

  if (unsyncedSessions.length === 0) return

  const { data } = await apiClient.post('/v1/sessions/batch', { sessions: unsyncedSessions })

  for (const { id, server_id } of data.synced) {
    db.prepare(`UPDATE local_sessions SET synced = 1 WHERE id = ?`).run(id)
  }
  for (const { id, reason } of data.errors) {
    db.prepare(`
      UPDATE local_sessions SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?
    `).run(reason, id)
  }
  ```

- [ ] `src/main/sync/scheduler.ts`:
  - Call `syncPendingSessions()` every 30 seconds
  - Also call on app focus and on network `'online'` event
  - Exponential backoff if `sync_attempts > 3`

### Renderer UI

- [ ] `src/renderer/stores/timerStore.ts` — Zustand:
  - `isRunning`, `elapsedSeconds`, `currentSession`
  - `start(projectId, taskId)`, `stop()`, `switchTask(projectId, taskId)`
  - Subscribe to `ipcRenderer.on('timer:tick', ...)` to update `elapsedSeconds`

- [ ] `src/renderer/pages/Timer.tsx`:
  - Large elapsed time display: `HH:MM:SS`
  - Start/Stop button (single toggle)
  - Project picker dropdown (loads via `projects:list` IPC)
  - Task picker (loads tasks for selected project)
  - Notes text field (saved on stop)
  - Today's sessions list below timer (from `sessions:list-local` IPC)

- [ ] `src/renderer/components/ProjectPicker.tsx`:
  - Searchable combobox
  - Color dot indicator per project
  - "No project" option

---

## Definition of Done

1. Start timer → SQLite row created with `synced = 0` — confirmed with SQLite browser in dev
2. Stop timer → `ended_at` and `duration_sec` written to SQLite
3. Sync engine runs every 30 seconds and POSTs pending sessions to backend
4. After sync, `synced = 1` in SQLite, session visible in `GET /v1/sessions`
5. Kill network (airplane mode), track for 2 minutes, restore network → sessions sync automatically
6. Session batch sync respects `UNIQUE(user_id, device_id, started_at)` — no duplicates on retry
7. Timer tick is accurate to ±1 second even when app window is hidden in tray
8. "Switch task" creates two separate sessions in SQLite with no gap or overlap
9. Project list loads and is searchable in the ProjectPicker
10. `pnpm test` passes for sync engine unit tests

---

## Testing Checklist

| Test | Type | Tool |
|------|------|------|
| `startTimer` creates SQLite row | Unit | Vitest + in-memory SQLite |
| `stopTimer` sets `ended_at` and `duration_sec` | Unit | Vitest |
| `syncPendingSessions` sends correct batch and marks synced | Unit | Vitest + msw mock |
| Duplicate batch submission → no duplicate DB rows | Integration | Vitest + test DB |
| `POST /v1/sessions/batch` validates `ended_at > started_at` | Integration | Vitest + supertest |
| IDOR: cannot sync sessions to another org's project | Integration | Vitest |
| Timer tick fires every second (test 5 seconds) | Unit | Vitest + fake timers |
| Network restore triggers sync | Unit | Vitest + event emitter |
| Timer UI renders elapsed time correctly | Component | React Testing Library |
| Full timer flow (start → track → stop → sync) | E2E | Playwright (Electron) |
