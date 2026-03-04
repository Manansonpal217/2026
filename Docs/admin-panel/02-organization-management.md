# Admin Panel Module 02 — Organization Management (Super Admin)

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + React Query  
**Routes:** `/super-admin/organizations/*`  
**Access:** `super_admin` only

---

## Overview

Full CRUD for organizations. Super Admin can create, configure, suspend, reinstate, and delete orgs, and drill into any org to see all details, settings, users, billing history, and audit trail.

---

## Pages

### `/super-admin/organizations` — Org List

```
┌──────────────────────────────────────────────────────────┐
│  Organizations                          [+ New Org]      │
│  Search: [__________]  Filter: Status ▼  Plan ▼          │
│                                                          │
│  Name           Plan      Seats  Status    MRR    Actions│
│  ──────────── ─────────  ─────  ───────── ──────  ───────│
│  Acme Corp    Growth     24/50  ✅ Active  $240   [View] │
│  Beta Inc     Starter    8/10   ⚠️ Trial   $48    [View] │
│  Gamma LLC    Business   120/∞  ❌ Suspended $0   [View] │
└──────────────────────────────────────────────────────────┘
```

Columns: Name, Plan, Seats (used/total), Status badge, MRR, Created date, Actions  
Filters: Status (active/suspended/trial/cancelled), Plan, Search by name  
Pagination: 25 per page

---

### `/super-admin/organizations/new` — Create Org

Form fields:
```
Organization Name:  [_______________]
Slug (URL):         [_______________]  ← auto-generated from name
Plan:               [Growth ▼]
Seats:              [50]
Trial ends:         [Date picker]      ← leave empty for non-trial
Admin email:        [_______________]  ← person who will manage this org
Admin name:         [_______________]
[Cancel]  [Create Organization & Send Invite]
```

On submit:
1. POST `/super-admin/orgs`
2. Success: redirect to new org's detail page
3. Show success toast: "Org created. Invite sent to admin@acme.com"

---

### `/super-admin/organizations/[id]` — Org Detail (Tab Layout)

Tabs: **Overview** | **Settings** | **Users** | **Billing** | **Integrations** | **Audit Log**

#### Tab: Overview
```
┌─────────────────────────────────────┐
│  Acme Corp                          │
│  Slug: acme-corp  Plan: Growth      │
│  Status: ✅ Active                  │
│  Created: Jan 15, 2026              │
│  ─────────────────────────────────  │
│  Stats this month:                  │
│  Total hours tracked:  1,240 hrs    │
│  Active users:         23           │
│  Screenshots taken:    3,872        │
│  ─────────────────────────────────  │
│  Quick Actions:                     │
│  [Suspend Org]  [Edit Plan]         │
│  [Impersonate Admin] (future)       │
└─────────────────────────────────────┘
```

#### Tab: Settings
Full feature flag controls (see Module 04 Admin Panel).

#### Tab: Users
Paginated list of all users in org. Columns: name, email, role, status, last active.  
Click user → goes to `/super-admin/organizations/[id]/users/[userId]`

#### Tab: Billing
- Current plan + seats
- Payment method on file
- Invoice history (pulled from Stripe API)
- `[Suspend Org]` / `[Reinstate]` buttons
- Grace period status if overdue

#### Tab: Integrations
- Which tool connected (Jira, Asana, etc.)
- Last sync time + status
- `[Force Sync]` button
- Error message if sync is failing

#### Tab: Audit Log
All actions ever taken on/for this org (by super admin, org admin, or system).  
Columns: timestamp, actor, action, before, after.

---

## Suspend / Reinstate Flow (Modal)

```
Click [Suspend Org]:
    ┌──────────────────────────────────┐
    │  Suspend Acme Corp               │
    │                                  │
    │  Reason: [_____________________] │
    │  ☑ Notify org admin via email    │
    │                                  │
    │  [Cancel]  [Suspend Access]      │
    └──────────────────────────────────┘

Click [Suspend Access]:
    → PATCH /super-admin/orgs/:id/suspend
    → Org immediately suspended
    → All desktop apps show suspension screen
    → Page refreshes to show suspended state
```

---

## API Calls

```typescript
GET    /super-admin/orgs                    // list with filters
POST   /super-admin/orgs                    // create
GET    /super-admin/orgs/:id                // detail
PATCH  /super-admin/orgs/:id                // update
PATCH  /super-admin/orgs/:id/suspend        // suspend
PATCH  /super-admin/orgs/:id/reinstate      // reinstate
DELETE /super-admin/orgs/:id                // soft delete
GET    /super-admin/orgs/:id/users          // users in org
GET    /super-admin/orgs/:id/audit-log      // org audit log
GET    /super-admin/orgs/:id/reports/summary // monthly stats
```
