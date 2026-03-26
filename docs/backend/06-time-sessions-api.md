# Backend Module 06 — Time Sessions API

**Stack:** Node.js + Fastify + Prisma + PostgreSQL  
**Used by:** Desktop App (Sync Engine), Admin Panel (Reports)

---

## Overview

Receives time session data synced from desktop app's local SQLite. Handles session creation, completion, conflict deduplication, and serves session data to the admin panel for reporting. All sessions originate locally on the device and are pushed here.

---

## Database Table

```sql
time_sessions
  id                UUID PRIMARY KEY
  user_id           UUID FK → users
  org_id            UUID FK → organizations
  task_id           UUID FK → tasks
  project_id        UUID FK → projects
  started_at        TIMESTAMP
  ended_at          TIMESTAMP
  duration_seconds  INT
  is_manual         BOOLEAN DEFAULT false
  is_idle_excluded  BOOLEAN
  idle_seconds      INT DEFAULT 0
  notes             TEXT
  status            ENUM(active, paused, completed, discarded)
  logged_externally BOOLEAN DEFAULT false
```

---

## Endpoints

### Desktop App: Start Session (optimistic create)

```typescript
POST /app/sessions/start
Body: {
  local_id: string,         // local SQLite UUID
  task_id: string,
  project_id: string,
  started_at: ISO_string
}

Action:
  1. Check: no other active session for this user (prevent double-tracking)
  2. Create time_sessions row: { status: 'active', ... }
  3. Return: { session_id }  ← desktop stores this as server_session_id

Errors:
  409 → Active session already exists (return existing session_id)
```

### Desktop App: Sync Completed Session

```typescript
POST /app/sessions/sync
Body: {
  local_id: string,
  task_id, project_id,
  started_at, ended_at,
  duration_seconds,
  idle_seconds,
  notes,
  status: 'completed' | 'discarded'
}

Action:
  1. Deduplication check: find existing session by (user_id, started_at)
     - If found: update it (idempotent sync)
     - If not found: create new
  2. Return: { session_id, created: boolean }
```

### Desktop App: Pause/Resume Session

```typescript
PATCH /app/sessions/:id/pause
PATCH /app/sessions/:id/resume
(Updates status field — fire-and-forget, desktop is source of truth)
```

### Desktop App: Complete Session

```typescript
POST /app/sessions/:id/complete
Body: { ended_at, duration_seconds, idle_seconds, notes }

Action:
  1. Update time_sessions: { status: 'completed', ended_at, duration_seconds, idle_seconds, notes }
  2. Return: 200 OK
```

### Desktop App: Log Work (submit to external tools)

```typescript
POST /app/sessions/:id/log-work
Body: {
  notes: string,
  targets: ['jira', 'tempo'],
  duration_override?: number  // seconds, null = use session duration
}

Action:
  1. Load org's connected integration
  2. For each target in targets:
     a. Load plugin: IntegrationFactory.create(target)
     b. plugin.logWork(authData, { task_external_id, duration, notes })
     c. Create work_log_exports row: { status: 'success' | 'failed' }
  3. If all succeed: time_sessions.logged_externally = true
  4. Return: { results: [{ target, status, error? }] }
```

### Admin: Get Sessions for User

```typescript
GET /admin/users/:user_id/sessions?from=&to=&project_id=&page=&limit=

Response: {
  sessions: [{
    id, task_title, project_name,
    started_at, ended_at, duration_seconds,
    idle_seconds, activity_score_avg,
    logged_externally, screenshot_count
  }],
  total_seconds, page, total
}
```

### Admin: Get Sessions for Org (reports)

```typescript
GET /admin/reports/time?from=&to=&user_id=&project_id=&group_by=user|project|day

Response: aggregated time data per grouping
```

### Manager: Get Team Sessions

```typescript
GET /manager/sessions?from=&to=

Response: sessions for users in manager's team only
  (enforced via: WHERE user_id IN (SELECT id FROM users WHERE manager_id = :manager_id))
```

---

## Deduplication Logic

```typescript
async function upsertSession(userId: string, data: SessionSyncPayload) {
  // Try to find by local_id first (if server_session_id was returned before)
  // Then try by (user_id, started_at) as fallback
  const existing = await prisma.time_sessions.findFirst({
    where: {
      user_id: userId,
      started_at: new Date(data.started_at),
      // within 5-second window to handle clock drift
    },
  })

  if (existing) {
    return prisma.time_sessions.update({
      where: { id: existing.id },
      data: { ...data },
    })
  }

  return prisma.time_sessions.create({ data: { user_id: userId, ...data } })
}
```

---

## Work Log Exports Table

```sql
work_log_exports
  id              UUID PRIMARY KEY
  session_id      UUID FK → time_sessions
  user_id         UUID FK → users
  export_target   VARCHAR              -- "jira", "tempo", "google_sheets"
  external_id     VARCHAR              -- returned by integration (e.g., Jira worklog ID)
  duration_logged INT
  notes           TEXT
  status          ENUM(success, failed, pending)
  error_message   TEXT
  exported_at     TIMESTAMP
```

---

## Row-Level Security

All session queries enforce:

```typescript
// Employees: can only see own sessions
WHERE user_id = request.user.id

// Managers: own team only
WHERE user_id IN (SELECT id FROM users WHERE manager_id = :manager_id)

// Org Admin: entire org
WHERE org_id = request.user.org_id

// Super Admin: any org (with explicit org_id in query params)
```
