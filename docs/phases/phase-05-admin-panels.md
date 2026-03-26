# Phase 5 — Reporting, Admin Panel & Time Approval (Week 15–18)

## Goal

Admins and managers have a fully functional web dashboard to view time reports, screenshots, employee activity, manage their team, configure org settings, and approve/reject time sessions. Heavy reporting queries run against the RDS Read Replica. Budget alerts fire when a project exceeds its hour threshold. The employee time approval workflow is live.

---

## Prerequisites

- Phase 2–3 complete: Sessions and screenshots are syncing to PostgreSQL
- RDS Read Replica provisioned and `DATABASE_READ_URL` set in Secrets Manager
- Phase 1 complete: Admin panel login and route protection are working

---

## Key Packages to Install

### Backend

```bash
pnpm add date-fns                # Date math for reporting periods
```

### Web

```bash
pnpm add recharts                # Charts (time bar chart, activity heatmap)
pnpm add @tanstack/react-table   # Data tables with sorting/filtering
pnpm add react-day-picker        # Date range picker
pnpm add react-hook-form zod @hookform/resolvers
```

---

## Database Migrations

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  org_id      String
  actor_id    String   // user_id who performed the action
  action      String   // session.edited | session.approved | user.invited | setting.changed | etc.
  target_type String   // session | user | project | screenshot
  target_id   String
  old_value   Json?
  new_value   Json?
  ip_address  String?
  created_at  DateTime @default(now())

  @@index([org_id, created_at])
  @@index([actor_id])
}
```

Run:

```bash
pnpm prisma migrate dev --name phase-05-admin-reporting
```

---

## Files to Create

| File                                          | Description                             |
| --------------------------------------------- | --------------------------------------- |
| `src/routes/reports/time.ts`                  | Time summary by user/project/period     |
| `src/routes/reports/activity.ts`              | Activity score trends                   |
| `src/routes/reports/export.ts`                | CSV/JSON export                         |
| `src/routes/admin/users.ts`                   | User management (list, invite, suspend) |
| `src/routes/admin/settings.ts`                | Read/update OrgSettings                 |
| `src/routes/admin/audit-log.ts`               | Paginated audit log                     |
| `src/routes/sessions/approve.ts`              | Manager approve/reject sessions         |
| `src/routes/sessions/edit.ts`                 | Admin edit session with audit trail     |
| `src/lib/db-read.ts`                          | Prisma read-replica client              |
| `src/lib/audit.ts`                            | `logAuditEvent(...)` helper             |
| `src/queues/workers/budgetAlert.ts`           | BullMQ: project budget check            |
| Web: `app/dashboard/page.tsx`                 | Overview / summary dashboard            |
| Web: `app/dashboard/reports/page.tsx`         | Time reports with filters               |
| Web: `app/dashboard/team/page.tsx`            | User management                         |
| Web: `app/dashboard/team/[userId]/page.tsx`   | Individual employee view                |
| Web: `app/dashboard/screenshots/page.tsx`     | Screenshot gallery                      |
| Web: `app/dashboard/approvals/page.tsx`       | Time approval queue                     |
| Web: `app/dashboard/settings/page.tsx`        | Org settings form                       |
| Web: `app/dashboard/audit/page.tsx`           | Audit log viewer                        |
| Web: `components/reports/TimeBarChart.tsx`    | Recharts time bar chart                 |
| Web: `components/reports/ActivityHeatmap.tsx` | Activity heatmap grid                   |
| Web: `components/ScreenshotGallery.tsx`       | Screenshot grid with signed URLs        |
| Web: `components/ApprovalQueue.tsx`           | Manager approval interface              |

---

## Backend Tasks

### Read Replica Client (`src/lib/db-read.ts`)

```typescript
import { PrismaClient } from '@prisma/client'

export const dbRead = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_READ_URL } },
})
```

> All reporting endpoints use `dbRead` instead of the primary `db`.

### Time Reports API

- [ ] `GET /v1/reports/time`

  ```
  Query:
    from=ISO&to=ISO
    &user_id[]=       (multi-value, manager/admin only)
    &project_id[]=
    &group_by=day|week|project|user   (default: day)
    &page=1&limit=50

  Response:
  {
    total_seconds: number,
    breakdown: [
      {
        label: string,          // e.g. "2024-01-15" or project name or user name
        seconds: number,
        sessions: number
      }
    ],
    sessions: [TimeSession[]]   // only when not grouping
  }
  ```

  - Use `dbRead` (read replica)
  - Employees see only their own data; managers see their team; admins see all

- [ ] `GET /v1/reports/activity`

  ```
  Query:    ?user_id=&from=ISO&to=ISO
  Response: { activity_logs: [{ window_start, activity_score, active_app }] }
  ```

- [ ] `GET /v1/reports/export`
  ```
  Query:    ?from=ISO&to=ISO&format=csv|json&user_id[]=&project_id[]=
  Response: Content-Disposition: attachment; filename="report-YYYY-MM-DD.csv"
  ```

  - Stream the response for large exports

### Admin: User Management

- [ ] `GET /v1/admin/users`

  ```
  Query:    ?page=1&limit=50&status=active|suspended&role=
  Response: { users: [...], total }
  Auth: admin+
  ```

- [ ] `PATCH /v1/admin/users/:id`

  ```
  Request:  { role?, status?, name? }
  Response: { user }
  Auth: admin+
  Note: Cannot change super_admin role or suspend self
  ```

  - Log to `AuditLog`

- [ ] `DELETE /v1/admin/users/:id` — soft delete (set `status = 'suspended'`)

### Admin: Org Settings

- [ ] `GET /v1/admin/settings`

  ```
  Response: { settings: OrgSettings }
  Auth: admin+
  ```

- [ ] `PATCH /v1/admin/settings`
  ```
  Request:
  {
    screenshot_interval_seconds?: number,   // min 60, max 3600
    screenshot_retention_days?: number,     // min 7, max 365
    blur_screenshots?: boolean,
    activity_weight_keyboard?: number,      // must sum to 1 with other weights
    activity_weight_mouse?: number,
    activity_weight_movement?: number,
    time_approval_required?: boolean,
    mfa_required_for_admins?: boolean,
    mfa_required_for_managers?: boolean
  }
  Response: { settings }
  Auth: admin+
  ```

  - Validate weights sum to 1.0 (±0.01)
  - Log to `AuditLog` with `old_value` + `new_value`
  - Push updated settings to all connected desktop clients via WebSocket (Phase 6)

### Time Approval API

- [ ] `GET /v1/sessions/pending-approval`

  ```
  Query:    ?user_id=&project_id=&page=1&limit=50
  Response: { sessions: [TimeSession[]] }
  Auth: manager+ (sees only their team's sessions)
  ```

- [ ] `POST /v1/sessions/:id/approve`

  ```
  Request:  { notes? }
  Response: { session }
  Auth: manager+ (can only approve sessions of users they manage)
  ```

  - Set `approval_status = 'approved'`
  - Log to AuditLog
  - Enqueue `timeLogPush` job to push to integration (if configured)
  - Optionally send notification to employee

- [ ] `POST /v1/sessions/:id/reject`
  ```
  Request:  { reason }
  Response: { session }
  Auth: manager+
  ```

  - Set `approval_status = 'rejected'`
  - Log to AuditLog
  - Send notification to employee with `reason`

### Admin Session Edit

- [ ] `PATCH /v1/sessions/:id/admin-edit`
  ```
  Request:  { started_at?, ended_at?, project_id?, task_id?, notes? }
  Response: { session }
  Auth: admin only
  ```

  - Compute new `duration_sec` from `ended_at - started_at`
  - Log full old + new values to AuditLog
  - Cannot set `started_at` in the future

### Audit Log API

- [ ] `GET /v1/admin/audit-log`
  ```
  Query:    ?actor_id=&action=&target_type=&from=ISO&to=ISO&page=1&limit=50
  Response: { logs: [AuditLog[]], total }
  Auth: admin+
  ```

### Budget Alert Worker (`src/queues/workers/budgetAlert.ts`)

- [ ] Scheduled: every hour (BullMQ cron)
- [ ] For each project with `budget_hours` set:
  - Sum approved sessions in current month
  - If `sum >= 80%` of budget and no alert sent today: send email to admin
  - If `sum >= 100%` of budget: send "over budget" email
- [ ] Use `dbRead` for the aggregation query

---

## Web Admin Panel Tasks

### Dashboard Overview (`app/dashboard/page.tsx`)

- [ ] Cards: total hours (current week), active users right now, screenshots today, pending approvals count
- [ ] Time bar chart (last 7 days, grouped by day)
- [ ] Top projects by hours (this week)
- [ ] Recent activity feed

### Reports Page (`app/dashboard/reports/page.tsx`)

- [ ] Date range picker (react-day-picker)
- [ ] Multi-select filters: user, project, group-by
- [ ] Time breakdown table (TanStack Table — sortable, paginated)
- [ ] `TimeBarChart` — Recharts `BarChart`
- [ ] "Export CSV" button → calls `GET /v1/reports/export?format=csv`

### Individual Employee View (`app/dashboard/team/[userId]/page.tsx`)

- [ ] Summary: total hours this week/month
- [ ] Session timeline (list of sessions with project, duration, approval status)
- [ ] Activity score chart (line chart, hourly view)
- [ ] Screenshot gallery (last 24 hours)
- [ ] "Suspend" and "Change Role" actions

### Screenshot Gallery (`app/dashboard/screenshots/page.tsx`)

- [ ] Filterable by user + date range
- [ ] Grid of thumbnail-sized screenshots (blurred if org setting is on)
- [ ] Click to view full size (signed URL)
- [ ] Activity score badge on each screenshot

### Approval Queue (`app/dashboard/approvals/page.tsx`)

- [ ] Table of pending sessions (employee, project, dates, duration)
- [ ] Bulk approve/reject with checkbox selection
- [ ] Individual approve button per row
- [ ] "Reject" opens dialog requiring reason text

### Org Settings (`app/dashboard/settings/page.tsx`)

- [ ] Screenshot interval slider (60s–3600s)
- [ ] Blur toggle
- [ ] Retention days input
- [ ] Activity weights (three sliders that must sum to 1)
- [ ] Time approval toggle
- [ ] MFA enforcement toggles
- [ ] Save → `PATCH /v1/admin/settings`

---

## Definition of Done

1. `GET /v1/reports/time` returns correct totals grouped by day — confirmed against known test data
2. Report queries use `dbRead` (confirmed by checking PostgreSQL connection logs — primary DB not queried)
3. Admin can approve a session — `approval_status` changes to `'approved'` and audit log entry is created
4. Budget alert email is sent when a project exceeds 80% of its hour budget
5. CSV export downloads a valid CSV with correct headers and row data
6. Admin panel dashboard shows real data from the API
7. Employee can only see their own sessions via `GET /v1/reports/time`
8. Admin settings change updates `OrgSettings` in DB and logs old + new values in AuditLog
9. Screenshot gallery shows thumbnails and opens full-size image via signed URL
10. Approval queue shows pending sessions and bulk approve/reject works

---

## Testing Checklist

| Test                                         | Type        | Tool                  |
| -------------------------------------------- | ----------- | --------------------- |
| Report query groups by day correctly         | Unit        | Vitest + test data    |
| Report query uses read replica               | Integration | Vitest + query logger |
| Employee cannot see other users' sessions    | Integration | Vitest                |
| Approve session creates audit log            | Integration | Vitest                |
| Reject session sends notification            | Integration | Vitest + email mock   |
| Settings weights must sum to 1               | Unit        | Vitest                |
| Budget alert fires at 80% threshold          | Integration | Vitest                |
| CSV export has correct headers               | Integration | Vitest                |
| AuditLog stores old + new values             | Integration | Vitest                |
| Dashboard renders without errors             | Component   | React Testing Library |
| Approval queue renders and bulk select works | Component   | React Testing Library |
| Full approval flow                           | E2E         | Playwright            |
