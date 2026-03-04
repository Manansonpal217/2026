# Admin Panel Module 08 — Org Admin Dashboard

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + Recharts + React Query + Socket.io Client  
**Route:** `/admin/dashboard`  
**Access:** `org_admin` role

---

## Overview

The Org Admin's home screen. Shows a live overview of the organization: who is tracking right now, today's total hours, team activity summary, and quick links to manage users and reports.

---

## Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  Acme Corp Admin          John Smith ▼  [Notifications]  │
├──────────────┬───────────────────────────────────────────┤
│  NAVIGATION  │  Dashboard                                │
│  ──────────  │  ────────────────────────────────────     │
│  Dashboard   │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  Team        │  │Tracking  │ │ Hours    │ │ Avg Act. │  │
│  Projects    │  │Now: 12   │ │ Today    │ │ Score    │  │
│  Reports     │  │          │ │ 98.5h    │ │ 74% 🟢   │  │
│  Screenshots │  └──────────┘ └──────────┘ └──────────┘  │
│  Integration │                                            │
│  Export      │  Live: Who is tracking right now?         │
│  Settings    │  ┌────────────────────────────────────┐   │
│              │  │ 🔴 John Doe     API-123   01:23:45  │  │
│              │  │ 🔴 Jane Smith   TASK-42   00:45:12  │  │
│              │  │ ⏸  Bob Wilson  (paused)             │  │
│              │  └────────────────────────────────────┘   │
│              │                                            │
│              │  Team Summary — Today                      │
│              │  [Bar chart: hours per user]               │
│              │                                            │
│              │  Recent Sessions                           │
│              │  [List of last 10 sessions, any user]      │
└──────────────┴───────────────────────────────────────────┘
```

---

## Metric Cards

| Card | Value | Source |
|------|-------|--------|
| Tracking Now | COUNT users with active sessions | Redis (WebSocket heartbeats) |
| Hours Today | SUM duration for today | DB (real-time) |
| Hours This Week | SUM for current week | DB |
| Screenshots Today | COUNT screenshots today | DB |
| Avg Activity Score | AVG activity_percent today | DB |
| Active Users | Users who tracked today | DB |

---

## Live Tracking Table

Shows users currently tracking in real-time (updated every 30 seconds via WebSocket or polling):

```typescript
// Socket.io subscription for live updates
useEffect(() => {
  socket.on('activity_update', (data) => {
    setLiveTracking(data.users_tracking_now)
  })
}, [])

// Columns: avatar, name, current task, elapsed time, activity bar
interface LiveUser {
  user_id: string
  name: string
  avatar_url: string
  task_title: string
  elapsed_seconds: number
  status: 'active' | 'paused'
  activity_percent: number
}
```

Elapsed time shows a live counter (increments every second client-side once received from server).

---

## Team Summary Bar Chart

```typescript
// Hours per user today
<BarChart data={teamSummary} layout="vertical">
  <Bar dataKey="hours_today" name="Hours Today" fill="#6366f1" radius={[0, 4, 4, 0]} />
  <XAxis type="number" tickFormatter={(v) => `${v}h`} />
  <YAxis type="category" dataKey="name" width={100} />
  <Tooltip formatter={(v: number) => `${v.toFixed(1)}h`} />
</BarChart>
```

---

## Recent Sessions Feed

```
John Doe — API-123 Fix auth bug
2h 15m • 74% activity • 13 screenshots • ✅ Logged to Jira • 1 hour ago

Jane Smith — TASK-42 Update documentation
45m • 58% activity • 4 screenshots • In progress...

Bob Wilson — PROJ-88 Code review
1h 32m • 82% activity • 9 screenshots • ✅ Logged to Jira • 3 hours ago
```

Each row links to the session detail view (in user's profile page).

---

## Quick Actions

- **Invite User** → opens invite modal
- **View Reports** → goes to `/admin/reports/time`
- **Browse Screenshots** → goes to `/admin/reports/screenshots`
- **Integration Status** → shows connected tool + last sync time

---

## Alerts / Notifications Panel

Shown as a badge on the bell icon and in a dropdown:

| Alert | Trigger |
|-------|---------|
| Seat limit approaching | seats_used > 80% of seats_total |
| Integration sync failing | last_synced_at > 2 hours ago + error |
| Billing overdue | billing_status = 'overdue' |
| User unmapped in integration | unmatched external users exist |

---

## API Calls

```typescript
GET /admin/dashboard/stats           // metric cards
GET /admin/dashboard/live-tracking   // who is tracking now
GET /admin/dashboard/team-summary    // hours per user today
GET /admin/sessions?limit=10&sort=recent  // recent sessions
```

WebSocket subscription: `socket.on('activity_update', ...)` for live tracking updates.
