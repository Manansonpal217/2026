# Admin Panel Module 06 — Billing Management

**Stack:** Next.js 14 + TailwindCSS + shadcn/ui + Recharts + React Query + Stripe  
**Routes:** `/super-admin/billing/*`, `/admin/billing`  
**Access:** Super Admin (full), Org Admin (own billing only)

---

## Overview

Two perspectives:

1. **Super Admin** — Revenue dashboard, MRR tracking, failed payments, suspension management
2. **Org Admin** — View own plan, manage payment method, upgrade/downgrade via Stripe Customer Portal

---

## Super Admin: Billing Overview

### Page: `/super-admin/billing`

```
┌──────────────────────────────────────────────────────────┐
│  Billing & Revenue                                       │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │   MRR      │  │   ARR      │  │  Churn     │         │
│  │  $42,300   │  │ $507,600   │  │   2.1%     │         │
│  │  +12% MoM  │  │            │  │  -0.3% MoM │         │
│  └────────────┘  └────────────┘  └────────────┘         │
│                                                          │
│  MRR Over Time (12 months)                               │
│  [───────────── Line Chart ─────────────────]            │
│                                                          │
│  Revenue by Plan                                         │
│  Starter: $8,400 (20%)  Growth: $21,000 (50%)           │
│  Business: $12,900 (30%)                                 │
└──────────────────────────────────────────────────────────┘
```

---

### Page: `/super-admin/billing/failed-payments`

```
┌──────────────────────────────────────────────────────────┐
│  Failed Payments (3)                                     │
│                                                          │
│  Org         Plan    Invoice  Overdue  Auto-Suspend At   │
│  ────────── ──────── ──────── ──────── ─────────────────  │
│  Acme Corp  Growth  $240/mo  2 days   In 1 day           │
│  Beta Inc   Starter $48/mo   5 days   OVERDUE            │
│  ─────────────────────────────────────────────────────── │
│  [Email Admin]  [Suspend Now]  [Mark as Paid]           │
└──────────────────────────────────────────────────────────┘
```

Actions per row:

- **Email Admin** → sends payment reminder email
- **Suspend Now** → immediately suspend (skip remaining grace period)
- **Mark as Paid** → manual override if payment was received outside Stripe

---

### Revenue Charts (Recharts)

```typescript
// MRR growth over 12 months
<LineChart data={mrrHistory}>
  <Line dataKey="mrr" name="Total MRR" stroke="#6366f1" />
  <Line dataKey="new_mrr" name="New MRR" stroke="#22c55e" />
  <Line dataKey="churned_mrr" name="Churned" stroke="#ef4444" />
  <XAxis dataKey="month" />
  <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} />
  <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
</LineChart>
```

---

## Org Admin: Own Billing

### Page: `/admin/billing`

```
┌──────────────────────────────────────────────────────────┐
│  Billing & Subscription                                  │
│                                                          │
│  Current Plan:  Growth                                   │
│  Seats:         24 / 50 used                            │
│  Billing:       $240 / month                             │
│  Next invoice:  Apr 1, 2026                              │
│  Status:        ✅ Paid                                  │
│                                                          │
│  Payment Method:  Visa ending in 4242                   │
│  [Update Payment Method]                                 │
│                                                          │
│  ─────────────────────────────────────────────          │
│  [Manage Subscription →]  (opens Stripe Customer Portal) │
│  ─────────────────────────────────────────────          │
│  Invoice History:                                        │
│  Mar 1, 2026  $240  ✅ Paid   [Download]                │
│  Feb 1, 2026  $240  ✅ Paid   [Download]                │
└──────────────────────────────────────────────────────────┘
```

---

### Stripe Customer Portal

```typescript
async function openBillingPortal() {
  const { portal_url } = await api.post('/admin/billing/portal')
  window.location.href = portal_url // redirect to Stripe-hosted portal
}
```

The Stripe Customer Portal handles:

- Update payment method
- Download invoices
- Cancel subscription
- View upcoming invoice

---

### Upgrade Plan Banner

Shown when `seats_used / seats_total > 0.8`:

```
┌──────────────────────────────────────────────────────┐
│  ⚠️  You're using 24/25 seats (96%).                 │
│  Upgrade to Business for unlimited seats.             │
│  [Upgrade Plan →]                                     │
└──────────────────────────────────────────────────────┘
```

---

## API Calls

```typescript
// Super Admin
GET  /super-admin/billing/overview              // MRR, ARR, churn
GET  /super-admin/billing/mrr?from=&to=         // historical MRR
GET  /super-admin/billing/failed-payments        // overdue orgs
POST /super-admin/orgs/:id/billing/mark-paid     // manual override
POST /super-admin/orgs/:id/billing/send-reminder // email org admin

// Org Admin
GET  /admin/billing                              // own plan + status
POST /admin/billing/portal                       // Stripe portal session
GET  /admin/billing/invoices                     // invoice list (from Stripe)
```
