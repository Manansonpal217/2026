# Backend Module 08 — Activity Logs

**Stack:** Node.js + Fastify + Prisma + PostgreSQL  
**Used by:** Desktop App (sync), Admin Panel (reports, heatmaps)

---

## Overview

Receives batched activity log data from the desktop sync engine. Stores per-interval records with keyboard/mouse counts, active app, and computed activity scores. Powers productivity reports, activity heatmaps, and per-session analytics.

---

## Database Table

```sql
activity_logs
  id               UUID PRIMARY KEY
  session_id       UUID FK → time_sessions
  user_id          UUID FK → users
  org_id           UUID FK → organizations
  recorded_at      TIMESTAMP
  interval_seconds INT
  keyboard_events  INT
  mouse_events     INT
  mouse_distance_px INT
  active_app       VARCHAR
  active_url       VARCHAR
  activity_percent INT        -- 0-100 computed score
```

---

## Endpoints

### Desktop App: Batch Upload Activity Logs
```typescript
POST /app/activity-logs
Body: {
  logs: [{
    local_id: string,
    session_id: string,      // server session UUID
    recorded_at: ISO_string,
    interval_seconds: number,
    keyboard_events: number,
    mouse_events: number,
    mouse_distance_px: number,
    active_app: string,
    active_url?: string,
    activity_percent: number
  }]
}

Limits: max 100 logs per request

Action:
  1. Validate session_ids belong to request.user
  2. Deduplicate by (session_id, recorded_at)
  3. Batch insert into activity_logs
  4. Return: { inserted: number, duplicates_skipped: number }
```

### Admin: Get Activity for Session
```typescript
GET /admin/sessions/:session_id/activity

Response: {
  logs: [{ recorded_at, activity_percent, active_app, keyboard_events, mouse_events }],
  avg_activity: number,
  peak_activity: number,
  idle_intervals: number
}
```

### Admin: Get Hourly Activity Heatmap (User)
```typescript
GET /admin/users/:user_id/activity/heatmap?from=&to=

Response: {
  heatmap: [
    { date: '2026-03-04', hour: 9, avg_activity: 72, total_seconds: 3600 },
    { date: '2026-03-04', hour: 10, avg_activity: 85, total_seconds: 3600 },
    ...
  ]
}
```

### Admin: Get App Usage Breakdown (User)
```typescript
GET /admin/users/:user_id/activity/apps?from=&to=

Response: {
  apps: [
    { app_name: 'VS Code', total_seconds: 14400, percentage: 42 },
    { app_name: 'Chrome',  total_seconds: 7200,  percentage: 21 },
    ...
  ]
}
```

### Admin: Get Team Productivity Overview
```typescript
GET /admin/reports/activity?from=&to=&user_id=&project_id=

Response: {
  users: [{
    user_id, name,
    avg_activity_percent,
    total_tracked_seconds,
    top_app
  }]
}
```

### Manager: Team Activity
```typescript
GET /manager/reports/activity?from=&to=

Same as admin report, scoped to manager's team only
```

---

## Deduplication

```typescript
// On batch insert — skip existing by (session_id, recorded_at)
await prisma.$executeRaw`
  INSERT INTO activity_logs (...)
  VALUES ${values}
  ON CONFLICT (session_id, recorded_at) DO NOTHING
`
```

Add unique constraint:
```sql
ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_session_recorded_unique
  UNIQUE (session_id, recorded_at);
```

---

## Privacy Enforcement

```typescript
// Before inserting, enforce org settings
async function sanitizeLog(log: RawActivityLog, orgSettings: OrgSettings) {
  return {
    ...log,
    active_app: orgSettings.track_app_usage ? log.active_app : null,
    active_url: orgSettings.track_url       ? log.active_url  : null,
    keyboard_events: orgSettings.track_keyboard ? log.keyboard_events : 0,
    mouse_events: orgSettings.track_mouse ? log.mouse_events : 0,
    mouse_distance_px: orgSettings.track_mouse ? log.mouse_distance_px : 0,
  }
}
```

Even if desktop app sends the data, server enforces the org settings at insert time.

---

## Session Activity Score Rollup

After all logs are synced for a completed session, compute the session-level score:

```typescript
async function computeSessionActivityScore(sessionId: string) {
  const { _avg, _count } = await prisma.activity_logs.aggregate({
    where: { session_id: sessionId },
    _avg: { activity_percent: true },
    _count: true
  })

  // Attach avg score to session record (for quick display without joining)
  await prisma.time_sessions.update({
    where: { id: sessionId },
    data: { avg_activity_score: _avg.activity_percent }
  })
}
```

---

## Activity Score for Screenshot

When a screenshot is taken, the activity score from the surrounding 60-second interval is attached to the screenshot record (see Module 07). This shows green/yellow/red indicator on each screenshot in the admin panel.

```typescript
async function getActivityScoreForScreenshot(
  userId: string,
  capturedAt: Date
): Promise<number> {
  const log = await prisma.activity_logs.findFirst({
    where: {
      user_id: userId,
      recorded_at: {
        gte: new Date(capturedAt.getTime() - 60_000),
        lte: new Date(capturedAt.getTime() + 60_000)
      }
    }
  })
  return log?.activity_percent ?? 0
}
```
