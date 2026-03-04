# Backend Module 09 — Billing & Stripe

**Stack:** Node.js + Fastify + Stripe SDK + PostgreSQL  
**Used by:** Super Admin Panel, Org Admin Panel (self-serve), Stripe Webhooks

---

## Overview

Handles seat-based subscriptions via Stripe, payment failure detection, grace period enforcement, and automatic/manual org suspension. Integrates Stripe Customer Portal for self-serve plan changes.

---

## Database Tables

```sql
-- organizations (billing fields)
stripe_customer_id     VARCHAR
stripe_subscription_id VARCHAR
billing_status         ENUM(paid, overdue, failed, cancelled)
plan                   ENUM(starter, growth, business, enterprise)
seats_total            INT
trial_ends_at          TIMESTAMP

billing_events
  id           UUID PRIMARY KEY
  org_id       UUID FK → organizations
  event_type   VARCHAR   -- payment_failed | suspended | reinstated | upgraded | downgraded
  triggered_by ENUM(stripe_webhook, super_admin, system)
  actor_id     UUID FK → users
  metadata     JSONB
  created_at   TIMESTAMP
```

---

## Stripe Webhook Handler

```typescript
POST /webhooks/stripe
(Stripe signature verified on every request)

Handles:
  - invoice.payment_failed
  - invoice.payment_succeeded
  - customer.subscription.deleted
  - customer.subscription.updated
```

### `invoice.payment_failed`
```typescript
async function handlePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  const org = await prisma.organization.findFirst({
    where: { stripe_customer_id: invoice.customer as string }
  })
  if (!org) return

  // Set overdue
  await prisma.organization.update({
    where: { id: org.id },
    data: { billing_status: 'overdue' }
  })

  // Log billing event
  await createBillingEvent(org.id, 'payment_failed', 'stripe_webhook', { invoice_id: invoice.id })

  // Send warning email to org admin
  await sendPaymentFailedEmail(org)

  // Schedule auto-suspend after 3 days (if billing_cutoff_auto = true)
  await gracePeriodQueue.add('check-suspend', { orgId: org.id }, { delay: 3 * 24 * 60 * 60 * 1000 })
}
```

### `invoice.payment_succeeded`
```typescript
async function handlePaymentSucceeded(event: Stripe.Event) {
  const org = await findOrgByStripeCustomer(...)

  await prisma.organization.update({
    where: { id: org.id },
    data: { status: 'active', billing_status: 'paid', suspended_at: null }
  })

  await createBillingEvent(org.id, 'reinstated', 'stripe_webhook', {})

  // Broadcast reinstatement to all desktop clients
  io.to(`org:${org.id}`).emit('org:reinstated')
}
```

### `customer.subscription.deleted`
```typescript
// Subscription cancelled (not just failed payment)
await prisma.organization.update({
  data: { status: 'cancelled', billing_status: 'cancelled' }
})
// 90-day data retention window begins
```

---

## Trial Expiry Flow

```
3 days before trial_ends_at:
    → BullMQ cron job fires (daily 9 AM check)
    → Email to org admin:
       "Your TrackSync trial expires in 3 days.
        Add a payment method to continue — no interruption to your team."
    → Badge in admin panel: "Trial expires in 3 days"

1 day before:
    → Reminder email

On trial_ends_at:
    → Cron job: check orgs WHERE status = 'trial' AND trial_ends_at <= NOW()
    → org.status = 'trial_expired'  ← new status: access blocked but data preserved
    → Employees see: "Your organization's trial has ended"
    → Org admin can still log into web panel
    → Org admin sees full-screen prompt: "Add payment method to restore access"
    → billing_events row: { event_type: 'trial_expired' }

Org admin adds payment:
    → POST /admin/billing/subscribe (creates Stripe subscription)
    → On Stripe invoice.payment_succeeded:
        → org.status = 'active'
        → org.billing_status = 'paid'
        → Access restored immediately
        → WebSocket broadcast: org reinstated

After 14 days of trial_expired with no payment:
    → Data purge job scheduled (GDPR 90-day window still applies)
    → org.status = 'cancelled'
```

```typescript
// Cron: daily trial expiry check
cron.schedule('0 9 * * *', async () => {
  const now = new Date()

  // 3-day warning
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const warningOrgs = await prisma.organization.findMany({
    where: { status: 'trial', trial_ends_at: { lte: in3Days, gte: now } }
  })
  for (const org of warningOrgs) {
    await emailQueue.add('email', {
      template: 'trial_expiring_soon',
      to: await getOrgAdminEmail(org.id),
      variables: { org_name: org.name, days_remaining: getDaysUntil(org.trial_ends_at) }
    })
  }

  // Expire trials
  const expiredOrgs = await prisma.organization.findMany({
    where: { status: 'trial', trial_ends_at: { lte: now } }
  })
  for (const org of expiredOrgs) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: 'trial_expired' }
    })
    await createBillingEvent(org.id, 'trial_expired', 'system', {})
    await emailQueue.add('email', {
      template: 'trial_expired',
      to: await getOrgAdminEmail(org.id),
      variables: { org_name: org.name }
    })
    // WebSocket: notify all connected desktop apps
    io.to(`org:${org.id}`).emit('org:trial_expired')
  }
})
```

---

## Grace Period Queue (BullMQ)

```typescript
// Runs 3 days after payment_failed
worker.process('check-suspend', async (job) => {
  const org = await getOrg(job.data.orgId)

  if (org.billing_status !== 'overdue') return  // already paid — no action

  const settings = await getOrgSettings(org.id)
  if (!settings.billing_cutoff_auto) return      // auto-cutoff disabled — no action

  // Auto-suspend
  await suspendOrg(org.id, 'Non-payment (auto)', 'system')
})
```

---

## Endpoints

### Super Admin: Get Billing Overview
```typescript
GET /super-admin/billing/overview

Response: {
  mrr: number,           // sum of active subscription amounts
  arr: number,
  active_orgs: number,
  churned_this_month: number,
  failed_payments: [{ org_id, name, amount_due, days_overdue }]
}
```

### Super Admin: Get MRR History
```typescript
GET /super-admin/billing/mrr?from=&to=

Response: [{ date, mrr, new_mrr, churned_mrr }]
```

### Super Admin: Failed Payments
```typescript
GET /super-admin/billing/failed-payments

Response: [{
  org_id, name, plan, seats,
  invoice_amount, days_overdue,
  auto_suspend_at
}]
```

### Org Admin: Get Billing Info
```typescript
GET /admin/billing

Response: {
  plan, seats_total, seats_used,
  billing_status, current_period_end,
  next_invoice_amount,
  payment_method: { last4, brand }
}
```

### Org Admin: Open Stripe Customer Portal
```typescript
POST /admin/billing/portal

Action:
  Create Stripe Customer Portal session
  Return: { portal_url }
  (User redirected to Stripe-hosted portal for plan changes, payment update)
```

### Org Admin: Upgrade/Downgrade Plan
```typescript
POST /admin/billing/change-plan
Body: { plan: 'growth' | 'business', seats: number }

Action:
  1. Update Stripe subscription (with proration)
  2. Update org.plan + org.seats_total
  3. Billing event logged
```

---

## Pricing Plans

| Plan | Price/user/mo | Max Seats | Features |
|------|-------------|-----------|---------|
| Starter | $6 | 10 | Basic tracking, 1 integration, screenshots |
| Growth | $10 | 50 | All integrations, reports, Google Sheets |
| Business | $15 | Unlimited | SSO, audit logs, API access, priority support |
| Enterprise | Custom | Unlimited | On-premise, SLA, white-label |

---

## Seat Overage Handling

```typescript
// On user invite (Module 03)
if (org.seats_used >= org.seats_total) {
  // Option 1: Block invite (Starter/Growth plans)
  return reply.code(402).send({
    code: 'SEATS_EXHAUSTED',
    message: 'You have reached your seat limit. Upgrade your plan to add more users.'
  })

  // Option 2: Auto-add seat and charge proration (Business/Enterprise)
  await stripe.subscriptions.update(org.stripe_subscription_id, {
    items: [{ id: existingItem.id, quantity: org.seats_used + 1 }]
  })
}
```

---

## Billing Cutoff Flow Summary

```
Day 0:  Stripe fires payment_failed
        → billing_status = 'overdue'
        → Warning email to org admin
        → Grace period job scheduled (3 days)

Day 1:  Reminder email

Day 3:  Grace period job fires
        → If still overdue + billing_cutoff_auto = true:
            → org.status = 'suspended'
            → WebSocket: all desktop sessions terminated
            → Email: access suspended

Anytime: Admin pays → Stripe fires payment_succeeded
        → org.status = 'active'
        → WebSocket: access restored
```
