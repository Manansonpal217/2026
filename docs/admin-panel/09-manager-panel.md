# Admin Panel Module 09 — Manager Panel

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + Recharts + React Query  
**Routes:** `/manager/*`  
**Access:** `manager` role only

---

## Overview

Managers see a scoped view of the admin panel — only their direct reports. They can view team time logs, activity reports, and screenshots for their team members, but cannot manage users, billing, or settings.

---

## Pages

### `/manager/dashboard` — Manager Dashboard

```
┌──────────────────────────────────────────────────────────┐
│  My Team — Jane Smith          [Notifications]           │
├──────────────┬───────────────────────────────────────────┤
│  NAVIGATION  │  Dashboard                                │
│  ──────────  │                                           │
│  Dashboard   │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  My Team     │  │Tracking  │ │ Hours    │ │ Avg Act. │  │
│  Reports     │  │ Now: 4   │ │ Today    │ │ Score    │  │
│              │  │          │ │  38.5h   │ │  71% 🟢  │  │
│              │  └──────────┘ └──────────┘ └──────────┘  │
│              │                                           │
│              │  My Team — Currently Tracking             │
│              │  ┌──────────────────────────────────┐    │
│              │  │ 🔴 John Doe    API-123  00:52:10  │    │
│              │  │ 🔴 Bob Wilson  TASK-88  01:14:33  │    │
│              │  └──────────────────────────────────┘    │
│              │                                           │
│              │  Team Hours Today                         │
│              │  [Horizontal bar chart per team member]   │
└──────────────┴───────────────────────────────────────────┘
```

---

### `/manager/team` — Team List

```
┌──────────────────────────────────────────────────────────┐
│  My Team (6 members)                                     │
│                                                          │
│  Name          Status    Hours Today  Avg Activity       │
│  ─────────── ──────────  ──────────── ─────────────────  │
│  John Doe    ✅ Active   6.5h         74% 🟢    [View]  │
│  Bob Wilson  ✅ Active   8.2h         82% 🟢    [View]  │
│  Alice Chen  ⏸ Paused   4.1h         55% 🟡    [View]  │
│  Tom Park    ❌ Offline  0h           —          [View]  │
└──────────────────────────────────────────────────────────┘
```

Manager can:

- View each team member's sessions, activity, screenshots (read-only)
- Cannot invite, edit roles, suspend, or remove users

---

### `/manager/team/[userId]` — Team Member Detail

Same as the Org Admin's user detail page (Module 03), but:

- Read-only (no edit/suspend/remove buttons)
- All report tabs available: Overview, Time Logs, Screenshots, Activity

---

### `/manager/reports/time` — Team Time Report

```
┌──────────────────────────────────────────────────────────┐
│  Time Report — My Team         [This Week ▼]  [Export]  │
│                                                          │
│  Member ▼  Project ▼                                     │
│                                                          │
│  Name          Hours    Sessions  Top Project            │
│  ─────────── ──────── ──────────  ──────────────────────│
│  John Doe    32.5h      14        Backend API            │
│  Bob Wilson  41.2h      18        Mobile App v2          │
│  Alice Chen  24.0h       9        Website Redesign       │
│  ───────────────────────────────────────────────────────│
│  Total       97.7h      41                               │
│                                                          │
│  [Bar chart: daily hours per team member]                │
└──────────────────────────────────────────────────────────┘
```

Data scoped to `users WHERE manager_id = current_user.id` — enforced server-side.

---

### `/manager/reports/activity` — Team Activity Report

```
┌──────────────────────────────────────────────────────────┐
│  Activity — My Team          [This Week ▼]               │
│                                                          │
│  Member        Avg Activity  Active Time   Status        │
│  ─────────── ─────────────  ────────────   ───────────── │
│  John Doe    74% 🟢         28.5h          Normal        │
│  Bob Wilson  82% 🟢         38.0h          High performer│
│  Alice Chen  55% 🟡         22.0h          Monitor       │
│                                                          │
│  Team Heatmap — Activity by Day/Hour                     │
│  [Heat grid — averaged across team]                      │
└──────────────────────────────────────────────────────────┘
```

---

## Manager Scope Enforcement

All manager routes enforce team scoping server-side — not just client-side:

```typescript
// Backend middleware for manager routes
async function enforceManagerScope(request, reply, next) {
  if (request.user.role !== 'manager') return next()

  const teamUserIds = await prisma.user
    .findMany({
      where: { manager_id: request.user.id },
      select: { id: true },
    })
    .then((users) => users.map((u) => u.id))

  request.teamScope = teamUserIds // injected into all queries
  next()
}
```

---

## What Managers Can and Cannot Do

| Action                      | Manager                        |
| --------------------------- | ------------------------------ |
| View own team's time logs   | ✅                             |
| View own team's screenshots | ✅                             |
| View own team's activity    | ✅                             |
| Export reports              | ✅ (CSV only on Growth plan)   |
| Invite new users            | ❌                             |
| Edit user roles             | ❌                             |
| Suspend users               | ❌                             |
| Change settings             | ❌                             |
| View other teams' data      | ❌ (hard enforced server-side) |
| View billing                | ❌                             |

---

## API Calls

```typescript
GET /manager/dashboard/stats           // team metric cards
GET /manager/dashboard/live-tracking   // team members tracking now
GET /manager/team                      // direct reports list
GET /manager/team/:id                  // team member detail (read-only)
GET /manager/team/:id/sessions         // time logs
GET /manager/team/:id/screenshots      // screenshots
GET /manager/team/:id/reports/heatmap  // activity heatmap
GET /manager/reports/time              // team time report
GET /manager/reports/activity          // team activity report
```
