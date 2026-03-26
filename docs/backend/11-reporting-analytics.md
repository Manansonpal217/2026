# Backend Module 11 — Reporting & Analytics

**Stack:** Node.js + Fastify + Prisma + PostgreSQL  
**Used by:** Org Admin Panel, Manager Panel, Super Admin Panel (aggregate metrics)

---

## Overview

Provides pre-aggregated and on-demand reports for time tracking, activity scores, screenshot timelines, and productivity trends. All queries are scoped by role (manager sees team only, org admin sees full org, super admin sees all).

---

## RDS Read Replica for Reporting

> Reporting queries aggregate millions of activity log rows and run complex GROUP BY and window functions. Running these on the primary RDS instance during peak hours starves write operations.

```typescript
// Two separate Prisma/DB connections configured in the backend:

// src/db/index.ts
export const dbWrite = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

export const dbRead = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_URL ?? process.env.DATABASE_URL } },
  // Falls back to primary if read replica not configured (dev/staging)
})
```

All report handler functions use `dbRead`:

```typescript
// Example: time summary report
async function getTimeSummaryReport(orgId: string, from: Date, to: Date) {
  return dbRead.timeSession.groupBy({
    // ← dbRead, not dbWrite
    by: ['user_id', 'project_id'],
    where: { org_id: orgId, started_at: { gte: from, lte: to }, status: 'completed' },
    _sum: { duration_seconds: true },
    _count: true,
  })
}
```

Read replica lag is typically <1 second — acceptable for reporting (we don't need real-time data here).

---

## Report Types

| Report              | Granularity           | Available to       |
| ------------------- | --------------------- | ------------------ |
| Time by user        | Daily/weekly/monthly  | Org Admin, Manager |
| Time by project     | Daily/weekly/monthly  | Org Admin, Manager |
| Activity heatmap    | Hourly per day        | Org Admin, Manager |
| App usage breakdown | Per session / per day | Org Admin          |
| Screenshot timeline | Per user per day      | Org Admin          |
| Productivity trends | Weekly rolling avg    | Org Admin, Manager |
| Org summary (SaaS)  | Monthly               | Super Admin        |

---

## Endpoints

### Time Report: By User

```typescript
GET /admin/reports/time/by-user?from=&to=&user_id=&format=json|csv

Response: {
  period: { from, to },
  users: [{
    user_id, name,
    total_seconds,
    billable_seconds,     // duration - idle
    sessions_count,
    avg_session_minutes,
    by_project: [{ project_name, seconds }]
  }]
}
```

### Time Report: By Project

```typescript
GET /admin/reports/time/by-project?from=&to=&project_id=

Response: {
  projects: [{
    project_id, name,
    total_seconds,
    contributors: [{ user_id, name, seconds }]
  }]
}
```

### Time Report: Daily Timeline (for a user)

```typescript
GET /admin/users/:user_id/reports/timeline?from=&to=

Response: {
  days: [{
    date: '2026-03-04',
    total_seconds: 28800,
    sessions: [{
      id, task_title, started_at, ended_at,
      duration_seconds, activity_score_avg
    }]
  }]
}
```

### Activity Heatmap

```typescript
GET /admin/users/:user_id/reports/heatmap?from=&to=

Response: {
  heatmap: [
    { date: '2026-03-04', hour: 9,  avg_activity: 72 },
    { date: '2026-03-04', hour: 10, avg_activity: 85 },
    ...
  ],
  peak_hour: 10,
  avg_daily_activity: 76
}

SQL:
SELECT
  DATE(recorded_at) as date,
  EXTRACT(HOUR FROM recorded_at) as hour,
  AVG(activity_percent)::INT as avg_activity
FROM activity_logs
WHERE user_id = :user_id
  AND recorded_at BETWEEN :from AND :to
GROUP BY date, hour
ORDER BY date, hour
```

### App Usage Breakdown

```typescript
GET /admin/users/:user_id/reports/app-usage?from=&to=

Response: {
  apps: [
    { app_name: 'VS Code', total_seconds: 14400, percentage: 42 },
    { app_name: 'Chrome',  total_seconds: 7200,  percentage: 21 },
  ]
}

SQL:
SELECT
  active_app,
  SUM(interval_seconds) as total_seconds
FROM activity_logs
WHERE user_id = :user_id
  AND active_app IS NOT NULL
GROUP BY active_app
ORDER BY total_seconds DESC
```

### Team Productivity Overview

```typescript
GET /admin/reports/team-productivity?from=&to=

Response: {
  team: [{
    user_id, name,
    total_tracked_hours,
    avg_activity_percent,
    sessions_count,
    top_project
  }]
}
```

### Super Admin: Org Summary

```typescript
GET /super-admin/orgs/:id/reports/summary?month=2026-03

Response: {
  total_tracked_hours,
  active_users,
  screenshots_count,
  sessions_count,
  avg_activity_score
}
```

---

## CSV / PDF Export

```typescript
GET /admin/reports/time/by-user?format=csv

// CSV streaming response
reply.header('Content-Type', 'text/csv')
reply.header('Content-Disposition', 'attachment; filename="time-report-2026-03.csv"')

const stream = createCsvStream(data)
return reply.send(stream)
```

```typescript
GET /admin/reports/time/by-user?format=pdf

// PDF generation via Puppeteer or @pdf-lib
// Rendered from HTML template
```

---

## Report Caching

Expensive aggregations are cached in Redis:

```typescript
const REPORT_TTL = 300 // 5 minutes

async function getCachedReport(key: string, computeFn: () => Promise<any>) {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)
  const result = await computeFn()
  await redis.setex(key, REPORT_TTL, JSON.stringify(result))
  return result
}

// Usage:
const report = await getCachedReport(`report:time:${orgId}:${from}:${to}`, () =>
  computeTimeReport(orgId, from, to)
)
```

---

## Row-Level Security (All Reports)

```typescript
// Injected into every report query based on role
function getScopeFilter(user: User) {
  if (user.role === 'super_admin') return {}
  if (user.role === 'org_admin') return { org_id: user.org_id }
  if (user.role === 'manager') return { user_id: { in: getTeamUserIds(user.id) } }
  if (user.role === 'employee') return { user_id: user.id }
}
```

---

## Dashboard Quick Stats (Real-Time)

```typescript
GET /admin/dashboard/stats

Response: {
  tracking_now: number,        // users with active sessions RIGHT NOW
  hours_today: number,         // total org hours today
  hours_this_week: number,
  screenshots_today: number,
  avg_activity_today: number
}

// Partially from Redis (online users), partially from DB aggregation
```
