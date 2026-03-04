# Admin Panel Module 01 — Super Admin Dashboard

**Stack:** Next.js 14 (App Router) + TailwindCSS + shadcn/ui + Recharts + React Query  
**Route:** `/super-admin/dashboard`  
**Access:** `super_admin` role only

---

## Overview

The Super Admin's command center. Shows a real-time view of all organizations, revenue metrics, system health, and pending actions. This is the first screen after super admin logs in.

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  TrackSync Admin        Super Admin ▼   [Notifications 🔔]  │
├──────────────┬──────────────────────────────────────────────┤
│  NAVIGATION  │  Dashboard                                    │
│  ──────────  │  ─────────────────────────────────────────── │
│  Dashboard   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐│
│  Orgs        │  │  MRR   │ │ Orgs   │ │ Users  │ │Churn  ││
│  Billing     │  │ $42k   │ │  38    │ │  847   │ │ 2.1%  ││
│  Integrations│  │ +12%↑  │ │active  │ │active  │ │       ││
│  Audit Log   │  └────────┘ └────────┘ └────────┘ └───────┘│
│  Settings    │                                               │
│              │  MRR Growth Chart (last 12 months)           │
│              │  [Line chart — Recharts]                      │
│              │                                               │
│              │  Orgs Requiring Attention                     │
│              │  ┌─────────────────────────────────────────┐ │
│              │  │ ⚠️  Acme Corp — payment overdue 2 days  │ │
│              │  │ ⚠️  Beta Inc  — trial expires tomorrow  │ │
│              │  │ ❌  Gamma LLC — suspended                │ │
│              │  └─────────────────────────────────────────┘ │
│              │                                               │
│              │  Recent Activity (audit log feed)             │
└──────────────┴──────────────────────────────────────────────┘
```

---

## Metric Cards

| Card | Value | Source |
|------|-------|--------|
| MRR | Sum of active subscription amounts | Stripe API |
| ARR | MRR × 12 | Computed |
| Active Orgs | COUNT orgs WHERE status = 'active' | DB |
| Total Users | COUNT users WHERE status = 'active' | DB |
| New Orgs This Month | COUNT orgs created in current month | DB |
| Churn Rate | Cancelled orgs / start-of-month orgs | Computed |
| Failed Payments | COUNT orgs WHERE billing_status = 'overdue' | DB |

---

## Orgs Requiring Attention

Alerts shown for:
- `billing_status = 'overdue'` → "Payment overdue X days — [Suspend] [Email Admin]"
- `status = 'trial'` AND `trial_ends_at < now() + 3 days` → "Trial expires in X days"
- `status = 'suspended'` → "Suspended — [Reinstate]"
- Integration sync error for an org → "Jira sync failing since 2h"

---

## MRR Chart

```typescript
// React Query fetch
const { data: mrrHistory } = useQuery({
  queryKey: ['mrr-history'],
  queryFn: () => api.get('/super-admin/billing/mrr?from=2025-03&to=2026-03')
})

// Recharts LineChart
<LineChart data={mrrHistory}>
  <Line dataKey="mrr" name="MRR" stroke="#6366f1" />
  <Line dataKey="new_mrr" name="New MRR" stroke="#22c55e" />
  <Line dataKey="churned_mrr" name="Churned" stroke="#ef4444" />
</LineChart>
```

---

## Recent Audit Log Feed

Live feed of last 20 super admin actions:

```
[2 min ago]  You changed screenshot_interval for Acme Corp: 10 → 5
[1 hr ago]   You suspended Beta Inc (reason: non-payment)
[3 hr ago]   You created org: Gamma LLC
[Yesterday]  You reinstated Acme Corp
```

Links each entry to the relevant org/setting page.

---

## Quick Actions

| Action | Location |
|--------|----------|
| Create new org | Button → `/super-admin/organizations/new` |
| View failed payments | Alert badge → `/super-admin/billing/failed-payments` |
| View all audit logs | Link → `/super-admin/audit-log` |

---

## API Calls (React Query)

```typescript
// Dashboard data
GET /super-admin/dashboard/stats
GET /super-admin/billing/mrr?from=&to=
GET /super-admin/orgs?needs_attention=true
GET /super-admin/audit-log?limit=20
```
