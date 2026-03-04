# Phase 6 — Billing, Feature Flags & Real-Time Push (Week 19–21)

## Goal

Stripe-powered subscriptions are live with a fully automated trial-to-paid flow, suspension on payment failure, and reinstatement on payment success — all driven by webhooks with no manual intervention. A WebSocket layer (Socket.io) lets the backend push feature flag changes, billing suspension, and session approvals to the desktop app and admin panel in real time. Feature flags can be toggled per organisation from the admin panel without a deployment.

---

## Prerequisites

- Phase 1–5 complete: Users, orgs, sessions exist
- Stripe account with products configured: `starter_monthly`, `pro_monthly`, `enterprise_monthly`
- Stripe webhook endpoint registered in dashboard
- Redis is running (pub/sub for Socket.io)

---

## Key Packages to Install

### Backend
```bash
pnpm add stripe                  # Stripe SDK
pnpm add socket.io               # WebSocket server
pnpm add @fastify/websocket      # Fastify plugin (or use socket.io standalone)
```

### Desktop
```bash
pnpm add socket.io-client        # Socket.io client in renderer
```

### Web
```bash
pnpm add socket.io-client        # Socket.io in Next.js
```

---

## Database Migrations

```prisma
model Subscription {
  id                    String    @id @default(uuid())
  org_id                String    @unique
  stripe_customer_id    String    @unique
  stripe_subscription_id String?  @unique
  plan                  String    @default("trial")   // trial | starter | pro | enterprise
  status                String    @default("trialing") // trialing | active | past_due | suspended | canceled
  current_period_start  DateTime?
  current_period_end    DateTime?
  trial_ends_at         DateTime?
  cancel_at_period_end  Boolean   @default(false)
  created_at            DateTime  @default(now())
  updated_at            DateTime  @updatedAt

  organization          Organization @relation(fields: [org_id], references: [id])
}

model FeatureFlag {
  id          String   @id @default(uuid())
  org_id      String?              // null = global default
  flag_key    String               // screenshot_capture | integrations | advanced_reporting | time_approval
  enabled     Boolean  @default(true)
  override    Boolean? // null = use plan default; true/false = org-level override
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@unique([org_id, flag_key])
}

// Add to Organization model:
// stripe_customer_id String? @unique
```

Run:
```bash
pnpm prisma migrate dev --name phase-06-billing-flags
```

---

## Files to Create

| File | Description |
|------|------------|
| `src/routes/billing/checkout.ts` | Create Stripe checkout session |
| `src/routes/billing/portal.ts` | Customer portal session |
| `src/routes/billing/webhook.ts` | Stripe webhook handler |
| `src/routes/billing/status.ts` | `GET /v1/billing/status` |
| `src/routes/flags/index.ts` | Get feature flags for org |
| `src/routes/flags/admin.ts` | Admin override flags |
| `src/lib/stripe.ts` | Stripe SDK singleton + helpers |
| `src/lib/featureFlags.ts` | `isEnabled(orgId, flagKey)` |
| `src/lib/planFeatures.ts` | `PLAN_FEATURES` config map |
| `src/websocket/server.ts` | Socket.io server setup |
| `src/websocket/rooms.ts` | Room naming conventions |
| `src/websocket/emitter.ts` | `emitToOrg(orgId, event, data)` |
| Web: `app/dashboard/billing/page.tsx` | Billing management |
| Web: `components/BillingBanner.tsx` | Trial / overdue warning banner |
| Web: `hooks/useFeatureFlags.tsx` | React hook for flags |
| Web: `hooks/useSocket.tsx` | Socket.io connection hook |
| Desktop: `src/renderer/hooks/useSocket.ts` | Socket.io connection in renderer |

---

## Backend Tasks

### Plan Features Map (`src/lib/planFeatures.ts`)

```typescript
export const PLAN_FEATURES: Record<string, Record<string, boolean>> = {
  trial: {
    screenshot_capture: true,
    integrations: false,
    advanced_reporting: false,
    time_approval: false,
    max_users: 5,
  },
  starter: {
    screenshot_capture: true,
    integrations: false,
    advanced_reporting: false,
    time_approval: true,
    max_users: 10,
  },
  pro: {
    screenshot_capture: true,
    integrations: true,
    advanced_reporting: true,
    time_approval: true,
    max_users: 50,
  },
  enterprise: {
    screenshot_capture: true,
    integrations: true,
    advanced_reporting: true,
    time_approval: true,
    max_users: Infinity,
  },
}
```

### Feature Flag Resolver (`src/lib/featureFlags.ts`)

- [ ] `isEnabled(orgId, flagKey)`:
  1. Load org's `Subscription` → get `plan`
  2. Get plan default from `PLAN_FEATURES`
  3. Check `FeatureFlag` table for org-level override (`override: true/false`)
  4. Org-level override wins over plan default
  5. Cache result in Redis: `flags:{orgId}:{flagKey}` TTL 60s

### Stripe Integration (`src/lib/stripe.ts`)

- [ ] Stripe singleton: `new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })`
- [ ] `createCustomer(orgId, email, name)` → `stripe.customers.create`
- [ ] `createCheckoutSession(customerId, priceId, orgId)` → `stripe.checkout.sessions.create`
- [ ] `createPortalSession(customerId)` → `stripe.billingPortal.sessions.create`

### Billing API

- [ ] `POST /v1/billing/checkout`
  ```
  Request:  { plan: 'starter' | 'pro' | 'enterprise' }
  Response: { checkout_url }
  Auth: super_admin only
  ```
  - Create Stripe customer if not exists, store `stripe_customer_id` on org
  - Create checkout session with `success_url` and `cancel_url`

- [ ] `POST /v1/billing/portal`
  ```
  Response: { portal_url }
  Auth: super_admin only
  ```
  - Create customer portal session for self-serve plan changes and payment method updates

- [ ] `GET /v1/billing/status`
  ```
  Response: { plan, status, trial_ends_at, current_period_end, cancel_at_period_end }
  Auth: admin+
  ```

### Stripe Webhook (`src/routes/billing/webhook.ts`)

> Registered as `POST /v1/billing/webhook` — **no `authenticate` middleware** — raw body required for signature verification.

- [ ] Verify `stripe-signature` header: `stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET)`

- [ ] `checkout.session.completed`:
  - Create/update `Subscription` record
  - Set `org.status = 'active'`, `org.trial_expired = false`
  - Emit `'billing:activated'` via WebSocket to org room

- [ ] `customer.subscription.updated`:
  - Update `Subscription.plan`, `status`, `current_period_end`
  - Update `PLAN_FEATURES` cache (invalidate Redis)
  - Emit `'billing:plan_changed'` to org room

- [ ] `invoice.payment_failed`:
  - First failure: send warning email
  - After 3 failures (Stripe `past_due`): set `org.status = 'suspended'`
  - Emit `'billing:suspended'` to org room → desktop app shows lock screen

- [ ] `invoice.payment_succeeded`:
  - Clear `past_due`, reinstate if was suspended: `org.status = 'active'`
  - Emit `'billing:reinstated'` to org room

- [ ] `customer.subscription.deleted`:
  - Set `org.status = 'suspended'`, `Subscription.status = 'canceled'`
  - Emit `'billing:canceled'` to org room

- [ ] Trial expiry (scheduled BullMQ job, daily 08:00 UTC):
  - Find orgs where `trial_ends_at < now()` and `status = 'trialing'`
  - 7 days before: send warning email
  - On expiry: set `org.trial_expired = true`, `org.status = 'trial_expired'`
  - Emit `'billing:trial_expired'` to org room

### WebSocket Server (`src/websocket/server.ts`)

```typescript
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'

const io = new Server(httpServer, {
  cors: { origin: [config.WEB_URL, 'electron://localhost'] }
})
io.adapter(createAdapter(pubClient, subClient))  // Redis adapter for horizontal scaling

io.use(async (socket, next) => {
  // Verify JWT from handshake auth: socket.handshake.auth.token
  const user = await verifyToken(socket.handshake.auth.token)
  socket.data.user = user
  socket.data.orgId = user.orgId
  next()
})

io.on('connection', (socket) => {
  socket.join(`org:${socket.data.orgId}`)         // Org-wide room
  socket.join(`user:${socket.data.user.id}`)      // User-specific room
})
```

### WebSocket Emitter (`src/websocket/emitter.ts`)

```typescript
export function emitToOrg(orgId: string, event: string, data: unknown): void {
  io.to(`org:${orgId}`).emit(event, data)
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  io.to(`user:${userId}`).emit(event, data)
}
```

**Events emitted:**
| Event | Payload | Trigger |
|-------|---------|---------|
| `billing:suspended` | `{ reason }` | Stripe `invoice.payment_failed` (3rd attempt) |
| `billing:reinstated` | `{}` | Stripe `invoice.payment_succeeded` |
| `billing:trial_expired` | `{}` | Trial expiry job |
| `flags:updated` | `{ flags }` | Admin changes flag |
| `session:approved` | `{ session_id }` | Manager approves session |
| `session:rejected` | `{ session_id, reason }` | Manager rejects session |

### Feature Flag Admin API

- [ ] `GET /v1/flags` — get effective flags for caller's org
- [ ] `PATCH /v1/flags/:flagKey` (super_admin only) — set org-level override, emit `flags:updated`

---

## Desktop App Tasks

### Socket.io Client (`src/renderer/hooks/useSocket.ts`)

```typescript
import { io, Socket } from 'socket.io-client'
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function useSocket() {
  const { accessToken } = useAuthStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const socket = io(import.meta.env.VITE_API_WS_URL, {
      auth: { token: accessToken }
    })
    socketRef.current = socket

    socket.on('billing:suspended', () => {
      // Stop timer, show lock screen
      window.electron.ipcRenderer.invoke('timer:stop')
      // Navigate to /suspended
    })
    socket.on('billing:reinstated', () => window.location.reload())
    socket.on('flags:updated', (data) => { /* Refresh org settings */ })

    return () => { socket.disconnect() }
  }, [accessToken])

  return socketRef.current
}
```

### Billing Suspension Handling

- [ ] On `billing:suspended` WebSocket event:
  1. Stop timer (`ipcMain` call)
  2. Show full-screen "Your account is suspended" screen with CTA to billing portal
  3. Block all IPC calls to start timer while suspended

---

## Web Admin Panel Tasks

### Billing Page (`app/dashboard/billing/page.tsx`)

- [ ] Current plan badge + status
- [ ] Trial days remaining countdown (if trialing)
- [ ] "Upgrade Plan" button → calls `POST /v1/billing/checkout` → redirects to Stripe checkout
- [ ] "Manage Billing" button → calls `POST /v1/billing/portal` → opens Stripe customer portal
- [ ] Plan feature comparison table

### Billing Banner (`components/BillingBanner.tsx`)

- [ ] Show at top of all dashboard pages if:
  - Trial ends in < 7 days: "Your trial expires in X days — Upgrade now"
  - `status = 'past_due'`: "Payment failed — Update payment method"
  - `status = 'suspended'`: "Account suspended — Resolve billing"
- [ ] Dismiss button (stores dismissal in localStorage for 24h max)

### React Hooks

- [ ] `useFeatureFlags()` — fetches `GET /v1/flags`, returns `{ isEnabled(flagKey) }`, refreshes on `flags:updated` WebSocket event
- [ ] `useSocket()` — connects to Socket.io, handles reconnection, subscribes to org room events

### Feature Flags Gate Component

```tsx
// components/FeatureGate.tsx
export function FeatureGate({ flag, children, fallback }: {
  flag: string
  children: ReactNode
  fallback?: ReactNode
}) {
  const { isEnabled } = useFeatureFlags()
  return isEnabled(flag) ? <>{children}</> : <>{fallback ?? null}</>
}
```
Usage: Wrap "Integrations" nav item in `<FeatureGate flag="integrations">`.

---

## Definition of Done

1. New org gets 14-day trial, `Subscription.status = 'trialing'`
2. Clicking "Upgrade" redirects to Stripe checkout, completes payment → org status becomes `active`
3. Stripe `invoice.payment_failed` webhook sets org to `suspended` after 3 failures — desktop app shows lock screen within 5 seconds
4. `invoice.payment_succeeded` reinstates org — desktop app unlocks without requiring a re-login
5. `GET /v1/flags` returns correct flags based on plan — `integrations: false` for trial plan
6. Admin toggles a feature flag in the panel → all connected desktop clients receive `flags:updated` within 2 seconds
7. Trial expires → `billing:trial_expired` event received by desktop and web; timer is blocked
8. WebSocket reconnects automatically after a network interruption

---

## Testing Checklist

| Test | Type | Tool |
|------|------|------|
| `isEnabled` returns plan default correctly | Unit | Vitest |
| `isEnabled` org override wins over plan default | Unit | Vitest |
| Stripe webhook signature verification | Unit | Vitest + stripe test events |
| `checkout.session.completed` activates org | Integration | Vitest + Stripe CLI webhook forward |
| `invoice.payment_failed` suspends org | Integration | Vitest |
| `invoice.payment_succeeded` reinstates org | Integration | Vitest |
| WebSocket emits to correct org room | Integration | Vitest + Socket.io test client |
| Desktop receives `billing:suspended` and stops timer | Integration | Playwright (Electron) |
| `flags:updated` event propagates to web client | Integration | Vitest + ws client |
| Trial expiry job fires on correct date | Unit | Vitest + fake timers |
