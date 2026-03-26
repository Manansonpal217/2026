# Admin Panel Module 07 — Reports & Screenshots

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + Recharts + React Query  
**Routes:** `/admin/reports/*`, `/manager/reports/*`  
**Access:** Org Admin (full org), Manager (own team only)

---

## Overview

Org Admin and Managers view time reports, activity analytics, and screenshot timelines for their team. All data is scoped by role. Export to CSV and PDF available.

---

## Pages

### `/admin/reports/time` — Time Report

```
┌──────────────────────────────────────────────────────────┐
│  Time Report              [This Week ▼]  [Export CSV]    │
│  User ▼  Project ▼  Group by: [User ▼]                  │
│                                                          │
│  Name          Hours    Sessions  Top Project            │
│  ─────────── ──────── ──────────  ──────────────────────│
│  John Doe    32.5h      14        Backend API            │
│  Jane Smith  28.0h      11        Website Redesign       │
│  Bob Wilson  41.2h      18        Mobile App v2          │
│  ───────────────────────────────────────────────────────│
│  Total       101.7h     43                               │
│                                                          │
│  [Chart: Hours per day — Bar Chart]                      │
└──────────────────────────────────────────────────────────┘
```

Filter options:

- Date range: Today / This Week / This Month / Last Month / Custom
- User: All / specific user
- Project: All / specific project
- Group by: User / Project / Day

---

### Time Breakdown Chart

```typescript
<BarChart data={dailyHours}>
  {users.map(user => (
    <Bar
      key={user.id}
      dataKey={user.id}
      name={user.name}
      stackId="hours"
      fill={user.color}
    />
  ))}
  <XAxis dataKey="date" />
  <YAxis tickFormatter={(v) => `${v}h`} />
  <Tooltip formatter={(v: number) => formatDuration(v * 3600)} />
  <Legend />
</BarChart>
```

---

### `/admin/reports/activity` — Activity Report

```
┌──────────────────────────────────────────────────────────┐
│  Activity Report               [This Week ▼]             │
│                                                          │
│  Name          Avg Activity  Active Time   Top App       │
│  ─────────── ─────────────  ────────────   ──────────── │
│  John Doe    74% 🟢         28.5h          VS Code       │
│  Jane Smith  58% 🟡         24.0h          Chrome        │
│  Bob Wilson  82% 🟢         38.0h          VS Code       │
│                                                          │
│  Heatmap: Team Activity by Hour                          │
│  [Heat grid — day of week × hour of day]                 │
└──────────────────────────────────────────────────────────┘
```

Activity score color coding:

- 🟢 Green: 61–100%
- 🟡 Yellow: 31–60%
- 🔴 Red: 0–30%

---

### Heatmap Component

```typescript
// 7 rows (Mon–Sun) × 24 columns (0–23h)
// Color intensity = avg_activity for that cell
function ActivityHeatmap({ data }: { data: HeatmapCell[] }) {
  return (
    <div className="grid grid-cols-24">
      {data.map(cell => (
        <div
          key={`${cell.day}-${cell.hour}`}
          className="w-4 h-4 rounded-sm"
          style={{ backgroundColor: getHeatColor(cell.avg_activity) }}
          title={`${cell.day} ${cell.hour}:00 — ${cell.avg_activity}% avg`}
        />
      ))}
    </div>
  )
}
```

---

### `/admin/reports/screenshots` — Screenshot Browser

```
┌──────────────────────────────────────────────────────────┐
│  Screenshots              User ▼  [Mar 4, 2026 ▼]       │
│                                                          │
│  John Doe — Mar 4                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │ 🟢82%│ │ 🟡45%│ │ 🟢91%│ │ 🔴12%│ │ 🟢74%│          │
│  │ 9:10 │ │ 9:20 │ │ 9:30 │ │ 9:40 │ │ 9:50 │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                          │
│  Jane Smith — Mar 4                                      │
│  ┌──────┐ ┌──────┐ ...                                   │
└──────────────────────────────────────────────────────────┘
```

Features:

- Grouped by user and date
- Activity score badge on each thumbnail (color-coded)
- Click thumbnail → opens full-size modal with signed URL
- Admin can delete screenshot from modal (with audit log)
- Filter by user, date, activity score range

---

### Screenshot Full View Modal

```
┌───────────────────────────────────────────────────────┐
│  John Doe — Mar 4, 2026 9:10 AM           [✕ Close]  │
│                                                       │
│  [Full screenshot image]                              │
│                                                       │
│  Activity Score: 82% 🟢                               │
│  Session: API-123 Fix auth bug                        │
│  Duration at this point: 43 min                       │
│                                                       │
│  Keyboard events: 142  Mouse events: 38               │
│  Active app: VS Code                                  │
│                                                       │
│  [← Previous]  [Next →]  [🗑️ Delete Screenshot]      │
└───────────────────────────────────────────────────────┘
```

---

### Export Options

```typescript
// CSV Export
async function exportCSV() {
  const url = buildUrl('/admin/reports/time/by-user', {
    ...currentFilters,
    format: 'csv',
  })
  window.location.href = url // triggers download
}

// PDF Export
async function exportPDF() {
  const { pdf_url } = await api.post('/admin/reports/export', {
    type: 'time',
    filters: currentFilters,
    format: 'pdf',
  })
  window.open(pdf_url)
}
```

---

### Manager Reports (`/manager/reports/*`)

Same pages as org admin, but:

- All data automatically scoped to `manager_id = current_user.id`
- No "all users" option — only their direct reports shown
- No export to PDF (Growth plan+)

---

## API Calls

```typescript
// Reports
GET /admin/reports/time/by-user?from=&to=&user_id=&project_id=&format=json|csv
GET /admin/reports/time/by-project?from=&to=
GET /admin/reports/activity?from=&to=&user_id=
GET /admin/users/:id/reports/heatmap?from=&to=
GET /admin/users/:id/reports/app-usage?from=&to=
GET /admin/users/:id/reports/timeline?from=&to=
POST /admin/reports/export         // trigger PDF generation

// Screenshots
GET /admin/reports/screenshots?user_id=&from=&to=&page=
GET /admin/screenshots/:id/view    // get signed URL
DELETE /admin/screenshots/:id      // admin delete
```
