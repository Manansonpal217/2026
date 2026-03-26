# Backend Module 03 — User Management

**Stack:** Node.js + Fastify + Prisma + PostgreSQL  
**Used by:** Super Admin Panel, Org Admin Panel, Manager Panel

---

## Overview

Manages users within organizations: inviting, activating, deactivating, role assignment, manager-employee relationships, and user mapping to external integration accounts.

---

## Database Table

```sql
users
  id             UUID PRIMARY KEY
  org_id         UUID FK → organizations
  email          VARCHAR UNIQUE
  name           VARCHAR
  avatar_url     VARCHAR
  role           ENUM(super_admin, org_admin, manager, employee)
  manager_id     UUID FK → users      -- NULL for org_admin/manager
  status         ENUM(active, inactive, suspended)
  last_active_at TIMESTAMP
  desktop_token  VARCHAR              -- hashed token for desktop app auth
  created_at     TIMESTAMP
```

---

## Endpoints

### Org Admin: List Users in Org

```typescript
GET /admin/users?role=&status=&manager_id=&search=&page=&limit=

Response: {
  users: [{ id, name, email, role, manager, status, last_active_at }],
  total, page, limit
}
```

### Org Admin: Invite User

```typescript
POST /admin/users/invite
Body: { email, name, role: 'employee' | 'manager', manager_id? }

Action:
  1. Check seats_used < seats_total (else 402)
  2. Create user row: { status: 'inactive', role }
  3. Send invite email with desktop app download link + magic link
  4. Update seats_used
  5. Audit log

Response: { user_id, invite_link }
```

### Org Admin: Bulk Invite via CSV

```typescript
POST /admin/users/import
Body: multipart/form-data — CSV with columns: email, name, role, manager_email

Action:
  1. Parse CSV
  2. Validate each row
  3. Create users in batch
  4. Send invite emails in bulk queue (BullMQ)
  5. Return: { success_count, failed_rows: [{ row, reason }] }
```

### Org Admin: Update User

```typescript
PATCH /admin/users/:id
Body: { name?, role?, manager_id?, status? }

Notes:
  - status = 'suspended': revoke desktop tokens, block login
  - role change: audit logged
  - manager_id change: affects team visibility for old + new manager
```

### Org Admin: Remove User

```typescript
DELETE /admin/users/:id

Soft delete:
  1. user.status = 'inactive'
  2. Revoke all refresh tokens + desktop tokens
  3. Terminate any active desktop sessions (WebSocket push)
  4. Decrement seats_used
  5. Audit log
  6. (Data retained, not deleted — needed for historical reports)
```

### Org Admin: Get User Detail

```typescript
GET /admin/users/:id

Response: {
  user: { ...all fields },
  stats: {
    total_hours_this_week,
    total_hours_this_month,
    avg_activity_score,
    last_session_at
  }
}
```

### Org Admin: Assign Manager

```typescript
PATCH /admin/users/:id/manager
Body: { manager_id: UUID | null }
```

### Manager: Get Own Team

```typescript
GET /manager/team

Response: users where manager_id = request.user.id
  (managers can ONLY see their direct reports)
```

### Super Admin: View Any User

```typescript
GET /super-admin/orgs/:org_id/users/:id
(Full access across all orgs)
```

---

## Role Permissions Matrix

| Action             | Super Admin | Org Admin | Manager            | Employee |
| ------------------ | ----------- | --------- | ------------------ | -------- |
| View all org users | ✅          | ✅        | ❌ (own team only) | ❌       |
| Invite users       | ✅          | ✅        | ❌                 | ❌       |
| Change user role   | ✅          | ✅        | ❌                 | ❌       |
| Suspend user       | ✅          | ✅        | ❌                 | ❌       |
| Delete user        | ✅          | ✅        | ❌                 | ❌       |
| Assign manager     | ✅          | ✅        | ❌                 | ❌       |
| View own profile   | ✅          | ✅        | ✅                 | ✅       |

---

## User Invite Flow

```
Org admin invites employee@acme.com
    → User row created (status: inactive)
    → Email sent: "You've been invited to TrackSync by Acme Corp"
      Contains:
        - Desktop app download link (platform-detected)
        - Magic link for first login (expires 72h)
    → Employee clicks magic link
    → Browser opens → user sets password
    → Downloads desktop app
    → Desktop app: user logs in with email+password
    → user.status → 'active'
    → seats_used++
```

---

## Desktop Token

For long-lived desktop sessions, a separate `desktop_token` is generated post-login:

```typescript
// Generated on login, stored hashed in DB
// Used as an alternative auth method for background sync requests
// Can be revoked independently of JWT session
desktop_token = crypto.randomBytes(32).toString('hex')
user.desktop_token = bcrypt.hash(desktop_token)
```

---

## User–Integration Mapping

When a Jira/Asana connection is made, the integration sync tries to map external users to TrackSync users by email:

```typescript
async function mapExternalUsers(orgId: string, externalUsers: ExternalUser[]) {
  for (const ext of externalUsers) {
    const user = await prisma.user.findFirst({
      where: { org_id: orgId, email: ext.email },
    })
    if (user) {
      // Update task assignee_user_id for all tasks assigned to ext.id
      await prisma.task.updateMany({
        where: { assignee_external_id: ext.id },
        data: { assignee_user_id: user.id },
      })
    }
    // Unmapped users flagged for org admin manual mapping
  }
}
```
