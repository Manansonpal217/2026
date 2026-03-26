# Admin Panel Module 11 — Time Approval & Session Management

**Stack:** Next.js 14 + shadcn/ui + React Query  
**Routes:** `/manager/approvals`, `/admin/sessions`  
**Access:** Manager (own team), Org Admin (all teams)

---

## Overview

This module covers two related admin/manager capabilities:

1. **Time Approval Workflow** — Review and approve/reject pending employee sessions
2. **Admin Session Editing** — Correct obvious mistakes in completed sessions (with full audit trail)

---

## `/manager/approvals` — Approval Queue

See Backend Module 15 for the full flow. The UI renders the queue with expand-on-click for screenshots.

### Bulk Actions

```
✅ Select all on this page
   [Approve 12 selected]  [Reject 12 selected]
```

Bulk reject requires entering one reason that applies to all selected rejections.

### Filters

```
[All employees ▼]  [This week ▼]  [All projects ▼]  Status: [Pending ▼]
```

---

## `/admin/sessions` — Session Browser + Admin Edit

### Admin Session Edit (audit-logged)

Org admins can correct sessions that were accidentally too long or have wrong tasks:

```
┌────────────────────────────────────────────────────────────┐
│  Edit Session                                [Admin Edit]  │
│                                                            │
│  Employee: John Doe                                        │
│  Original Task: API-123 Fix auth bug                       │
│                                                            │
│  Task:    [API-123 Fix auth bug ▼]    ← can change task   │
│  Start:   [9:00 AM]                   ← can adjust time   │
│  End:     [11:15 AM]                  ← can adjust time   │
│  Duration: 2h 15m  (auto-calculated)                       │
│                                                            │
│  Reason for edit (required):                               │
│  [Employee confirmed this was recorded incorrectly — ...]  │
│                                                            │
│  ⚠️  This action is audit logged and visible to the       │
│     employee.                                              │
│                                                            │
│  [Cancel]          [Save Changes]                          │
└────────────────────────────────────────────────────────────┘
```

### PATCH `/v1/admin/sessions/:id`

```typescript
PATCH /v1/admin/sessions/:id
Auth: org_admin
Body: {
  task_id?: string,
  started_at?: string,       // ISO timestamp
  ended_at?: string,
  duration_seconds?: number, // if duration entered manually without start/end
  edit_reason: string        // required — stored in audit log
}

Action:
  1. Load session, verify it belongs to request.org_id
  2. Check: cannot edit sessions older than 90 days (business rule)
  3. Recalculate duration_seconds from started_at/ended_at
  4. Update session:
     - task_id, project_id, started_at, ended_at, duration_seconds
     - admin_adjusted = true
     - updated_at = NOW()
  5. Write audit log entry:
     {
       action: 'session.admin_edit',
       actor_id: admin_user_id,
       org_id: org_id,
       before_value: { task_id, started_at, ended_at, duration_seconds },
       after_value:  { task_id, started_at, ended_at, duration_seconds },
       metadata: { reason: edit_reason }
     }
  6. Notify employee by email:
     "Your session has been adjusted by an admin.
      Task: API-123   Duration: 2h 15m → 2h 00m
      Reason: [reason provided by admin]
      Contact your admin if you have questions."
  7. If session was logged to Jira/Sheets: re-trigger log with corrected values
  8. Return updated session
```

### Admin Edit Audit Trail View

```
┌────────────────────────────────────────────────────────────┐
│  Session History (API-123 — Mar 4, 2026)                  │
│                                                            │
│  Mar 4, 2026 11:15 AM  ← Original: 2h 15m                │
│  Mar 5, 2026 2:30 PM   ← Admin edit by Sarah Admin         │
│                           Duration: 2h 15m → 2h 00m        │
│                           Reason: "Employee confirmed..."  │
└────────────────────────────────────────────────────────────┘
```

---

## Project Budget Alerts

When a project has `budget_hours` set, the session browser shows budget status:

```
┌──────────────────────────────────────────────────────────┐
│  Project: Backend API v2                                 │
│  Budget:  100 hours                                      │
│                                                          │
│  Used:  ████████████████░░░░  82h 30m (82%)  🟡         │
│                                                          │
│  ⚠️  Project is at 82% budget.                          │
│     Alert was sent to Org Admin on Mar 3, 2026.          │
└──────────────────────────────────────────────────────────┘
```

### Budget Alert Logic

```typescript
// Called after any session is added to a project
async function checkProjectBudget(projectId: string, orgId: string): Promise<void> {
  const project = await getProject(projectId)
  if (!project.budget_hours) return

  const totalHours = await getTotalHoursForProject(projectId)
  const percentage = (totalHours / project.budget_hours) * 100

  const alerts = [
    { threshold: 80, template: 'project_budget_80pct' },
    { threshold: 100, template: 'project_budget_exceeded' },
  ]

  for (const alert of alerts) {
    if (percentage >= alert.threshold) {
      // Only send once per threshold per project (check last_alert in project_budget_alerts)
      const alreadySent = await hasAlertBeenSent(projectId, alert.threshold)
      if (!alreadySent) {
        await sendBudgetAlert(project, orgId, percentage, alert.template)
        await markAlertSent(projectId, alert.threshold)
      }
    }
  }
}
```

```sql
project_budget_alerts
  id              UUID PRIMARY KEY
  project_id      UUID FK → projects
  threshold_pct   INT           -- 80, 100
  alerted_at      TIMESTAMP
  total_hours     FLOAT         -- hours at time of alert

  UNIQUE(project_id, threshold_pct)  -- only one alert per threshold
```
