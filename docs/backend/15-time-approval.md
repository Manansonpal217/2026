# Backend Module 15 — Time Approval Workflow

**Stack:** Node.js + Fastify + Prisma + BullMQ + WebSockets  
**Toggle:** `org_settings.time_approval_required` (default: false)

---

## Overview

When `time_approval_required = true`, completed sessions enter a `pending` approval state. Managers must review and approve or reject them. Approved sessions are included in reports and external tool logging. This feature is required by agencies, contractors, and companies with strict payroll audit needs.

---

## How It Works

```
Employee completes session (Stop & Log)
    → If time_approval_required = true:
        session.approval_status = 'pending'
        → Do NOT log to external tools yet (Jira, Sheets, etc.)
        → Notify manager (email + WebSocket push)
        → Employee sees: "Session submitted for approval ⏳"
    → If time_approval_required = false:
        session.approval_status = 'not_required' (existing flow — unchanged)
```

---

## Manager Approval Queue

```
/manager/approvals page:

┌──────────────────────────────────────────────────────────┐
│  Pending Approvals                               [3]     │
│                                                          │
│  Employee          Task              Duration  Activity │
│  ──────────────    ──────────────    ──────── ─────────  │
│  John Doe          API-123           2h 15m    74% 🟢   │
│  John Doe          TASK-42           3h 00m    58% 🟡   │
│  Jane Smith        UI-45 Design      1h 45m    42% 🟠   │
│                                                          │
│  [Approve All]  [Select...]  [Reject Selected]          │
└──────────────────────────────────────────────────────────┘
```

Click a row to expand:

```
▼ John Doe — API-123 Fix auth bug — 2h 15m

  Date: Mar 4, 2026   9:00 AM – 11:15 AM
  Activity: 74% overall
  Screenshots: 13
  Notes: "Fixed JWT expiry issue"

  [View Screenshots]

  Reject reason (optional): [________________________]

  [✓ Approve]  [✕ Reject]
```

---

## API Endpoints

```typescript
GET /v1/manager/approvals
    Params: status=pending|approved|rejected&from=&to=&user_id=
    Returns: sessions awaiting approval by this manager

PATCH /v1/manager/approvals/:session_id/approve
    Auth: manager or org_admin
    Action:
        1. SET approval_status = 'approved', approved_by = manager_id, approved_at = NOW()
        2. Trigger external logging (if session.logged_externally = false):
              BullMQ: { type: 'log_approved_session', session_id }
        3. Notify employee: "Your session was approved ✅"
        4. Audit log entry

PATCH /v1/manager/approvals/:session_id/reject
    Body: { reason?: string }
    Action:
        1. SET approval_status = 'rejected'
        2. Store rejection_reason in time_sessions.notes (append)
        3. Notify employee: "Your session was rejected ❌"
           With reason if provided
        4. Audit log entry

POST /v1/manager/approvals/bulk-approve
    Body: { session_ids: string[] }
    Action: Approve all listed sessions in a single DB transaction

GET /v1/app/my-sessions/pending-approvals
    Returns: employee's own sessions with approval_status = 'pending'
```

---

## Notifications

```typescript
// Email to manager when employee submits session for approval
{
  template: 'session_pending_approval',
  subject: 'John Doe submitted a session for approval',
  body: `
    Task: API-123 Fix auth bug
    Duration: 2h 15m
    Activity: 74%
    Date: Mar 4, 2026 9:00–11:15 AM

    [Review & Approve →] https://app.tracksync.io/manager/approvals
  `
}

// WebSocket push to manager's admin panel
io.to(`user:${manager_id}`).emit('approval:new', {
  session_id, employee_name, task_name, duration
})

// Email to employee on approval/rejection
{
  template: 'session_approved',   // or 'session_rejected'
  subject: 'Session approved ✅',
  body: `Your 2h 15m session on API-123 has been approved.`
}
```

---

## Org Admin Override

Org admins can approve or reject any session regardless of the manager assignment:

```typescript
// Same endpoints as manager but with org_admin role check
// Org admin sees ALL pending sessions across the org
GET /v1/admin/approvals?status=pending
```

---

## Auto-Approve on Manager Inaction (Configurable)

```sql
-- org_settings
approval_auto_approve_after_hours  INT DEFAULT NULL  -- NULL = never auto-approve
-- If set: sessions auto-approved after N hours of manager inaction
```

```typescript
// Cron: hourly auto-approve check
cron.schedule('0 * * * *', async () => {
  const orgsWithAutoApprove = await prisma.orgSettings.findMany({
    where: { approval_auto_approve_after_hours: { not: null } },
  })

  for (const settings of orgsWithAutoApprove) {
    const cutoff = new Date(Date.now() - settings.approval_auto_approve_after_hours! * 3600_000)
    const sessions = await prisma.timeSession.findMany({
      where: {
        org_id: settings.org_id,
        approval_status: 'pending',
        ended_at: { lt: cutoff },
      },
    })

    for (const session of sessions) {
      await approveSession(session.id, 'system', 'Auto-approved after manager inaction')
    }
  }
})
```
