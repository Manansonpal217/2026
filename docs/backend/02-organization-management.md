# Backend Module 02 — Organization Management

**Stack:** Node.js + Fastify + Prisma + PostgreSQL  
**Used by:** Super Admin Panel, Org Admin Panel

---

## Overview

Manages the full lifecycle of organizations: creation, configuration, suspension, reinstatement, and deletion. Super Admin has full control. Org Admin can manage their own org's profile and user roster.

---

## Database Tables

```sql
organizations
  id                     UUID PRIMARY KEY
  name                   VARCHAR
  slug                   VARCHAR UNIQUE
  status                 ENUM(active, suspended, cancelled, trial)
  billing_status         ENUM(paid, overdue, failed, cancelled)
  suspended_at           TIMESTAMP
  suspension_reason      TEXT
  plan                   ENUM(starter, growth, business, enterprise)
  seats_total            INT
  seats_used             INT
  trial_ends_at          TIMESTAMP
  stripe_customer_id     VARCHAR
  stripe_subscription_id VARCHAR
  created_at             TIMESTAMP
```

---

## Endpoints

### Super Admin: Create Org

```typescript
POST /super-admin/orgs
Body: { name, slug, plan, seats_total, trial_ends_at?, admin_email }

Action:
  1. Create organizations row
  2. Create org_settings row (defaults)
  3. Create org_admin user row (status: pending_invite)
  4. Send invite email to admin_email
  5. Create billing_events row: { event_type: 'org_created' }
  6. Return: { org, invite_link }
```

### Super Admin: List All Orgs

```typescript
GET /super-admin/orgs?status=&plan=&search=&page=&limit=

Response: {
  orgs: [{ id, name, slug, status, plan, seats_used, seats_total, mrr, created_at }],
  total, page, limit
}
```

### Super Admin: Get Org Detail

```typescript
GET /super-admin/orgs/:id

Response: {
  org: { ...all fields },
  settings: { ...org_settings },
  stats: { total_users, active_today, total_sessions_this_month }
}
```

### Super Admin: Update Org

```typescript
PATCH /super-admin/orgs/:id
Body: { name?, plan?, seats_total? }

Creates audit_log entry on every change.
```

### Super Admin: Suspend Org

```typescript
PATCH /super-admin/orgs/:id/suspend
Body: { reason: string, notify: boolean }

Action:
  1. org.status = 'suspended', org.suspended_at = now()
  2. org.suspension_reason = reason
  3. billing_events row: { event_type: 'manually_suspended' }
  4. audit_logs row
  5. If notify: send email to org admin
  6. WebSocket broadcast to all org's connected desktop clients:
     { event: 'org:suspended', reason }
  7. All active sessions for org terminated
```

### Super Admin: Reinstate Org

```typescript
PATCH /super-admin/orgs/:id/reinstate

Action:
  1. org.status = 'active', org.suspended_at = NULL
  2. billing_events row: { event_type: 'reinstated' }
  3. audit_logs row
  4. WebSocket broadcast: { event: 'org:reinstated' }
```

### Super Admin: Delete Org

```typescript
DELETE /super-admin/orgs/:id

Soft delete only:
  1. org.status = 'cancelled'
  2. Revoke all user refresh tokens
  3. Audit log
  4. (Data retained for 90 days per GDPR, then purged)
```

### Org Admin: Get Own Org

```typescript
GET /admin/org

Response: {
  org: { id, name, slug, plan, seats_total, seats_used, status },
  integration: { connected tool name + status }
}
```

### Org Admin: Update Own Org Profile

```typescript
PATCH /admin/org
Body: { name? }
(slug and plan cannot be changed by org admin — super admin only)
```

---

## Org Status Machine

```
trial ──→ active (on first payment)
active ──→ suspended (billing fail or manual)
suspended ──→ active (payment succeeds or super admin reinstates)
active ──→ cancelled (org admin cancels plan)
cancelled ──→ [data purge after 90 days]
```

---

## Seat Count Management

```typescript
// Called when user is activated/deactivated
async function updateSeatCount(orgId: string) {
  const active = await prisma.user.count({
    where: { org_id: orgId, status: 'active', role: { not: 'super_admin' } },
  })
  await prisma.organization.update({
    where: { id: orgId },
    data: { seats_used: active },
  })

  // Check if over limit
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (org.seats_used > org.seats_total) {
    // Notify org admin + flag in Super Admin panel
    await notifyOverSeatLimit(org)
  }
}
```

---

## Audit Logging

Every mutating action on an org creates an `audit_logs` row:

```typescript
await createAuditLog({
  actor_id: request.user.id,
  org_id: orgId,
  action: 'org.suspend',
  before_value: { status: 'active' },
  after_value: { status: 'suspended', reason },
  ip_address: request.ip,
})
```
