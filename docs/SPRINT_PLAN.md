# TrackSync — MVP Sprint Implementation Plan

**Version:** 1.0 | **Target:** 500 users | **Date:** April 2026  
**Stack:** Node.js/Fastify · Prisma/PostgreSQL · BullMQ/Redis · Next.js 14 · Electron · Tailwind/Shadcn

---

## Codebase Reality Check

Before sprints: here is what is **already production-grade** — do not re-implement.

| System                                    | Status  | Notes                                                   |
| ----------------------------------------- | ------- | ------------------------------------------------------- |
| JWT auth (RS256) + Redis JTI blacklist    | ✅ Done | `authenticate.ts` — blacklist + role_version check      |
| Refresh token rotation                    | ✅ Done | `RefreshToken` model + hash storage                     |
| TOTP MFA + KMS-encrypted secrets          | ✅ Done | Backup codes, QR, enforcement flags                     |
| Screenshot capture → S3/R2 + AES-256      | ✅ Done | Sharp compression, thumbnails, signed URLs              |
| Activity tracking (keyboard/mouse/window) | ✅ Done | `uiohook-napi`, weighted scoring                        |
| Jira Cloud + Asana OAuth/PKCE             | ✅ Done | Token refresh, SSRF guard, circuit breaker              |
| Email via Resend + BullMQ queue           | ✅ Done | 3-attempt retry, exponential backoff                    |
| RBAC 5-role system + permission guards    | ✅ Done | `requireRole()`, `requirePermission()`, 15+ permissions |
| Offline sync (local SQLite → backend)     | ✅ Done | Crash recovery, dedup, exponential backoff              |
| Screenshot retention worker               | ✅ Done | Per-org retention, soft-delete, S3 cleanup              |
| Platform admin flag + basic admin UI      | ✅ Done | `is_platform_admin`, `/admin/orgs`, `/admin/users`      |
| Audit logging                             | ✅ Done | `AuditLog` model, actor + target + diff                 |
| Rate limiting (500 req/min)               | ✅ Done | Per-org + per-IP                                        |
| Health checks + Prometheus metrics        | ✅ Done | `/health`, `/metrics`                                   |

**Gaps to close across sprints below:**

- OfflineTime approval workflow (schema too simple, no status/source/approver)
- `UserSettingsOverride` model (two-tier settings resolution)
- SSE notification infrastructure
- Org timezone field
- Scheduled email reports (weekly/monthly)
- Streak daily calculation cron
- SS click notification (desktop toast on capture)
- Manager dashboard (no manager-specific view exists)
- Notification center UI
- Per-user settings override admin UI
- Professional UI upgrade (charts, heatmaps, animations)
- Payment due notification (#30)

---

## Design System — Established Before Any UI Sprint

> Apply once in Sprint 0, use everywhere after.

### Color Tokens (`globals.css` additions)

```css
/* Extend existing theme */
--brand-primary: 221 83% 53%; /* electric blue #2563EB */
--brand-secondary: 258 90% 66%; /* violet #7C3AED */
--brand-accent: 160 84% 39%; /* emerald #059669 */
--surface-raised: 222 47% 11%; /* dark card surface */
--surface-overlay: 222 47% 8%; /* modal/overlay bg */
--border-subtle: 222 20% 18%; /* low-contrast borders */
--text-tertiary: 220 9% 46%; /* de-emphasized text */
--success: 142 76% 36%;
--warning: 38 92% 50%;
--danger: 0 84% 60%;
```

### Typography Scale

- **Display:** `font-bold tracking-tight text-4xl` — page headers
- **Heading:** `font-semibold text-xl` — section titles
- **Subheading:** `font-medium text-sm text-muted-foreground` — card labels
- **Mono:** `font-mono tabular-nums` — time values, numbers

### Component Conventions

- Cards: `rounded-xl border border-border/60 bg-card shadow-sm`
- Stat cards: left accent bar via `border-l-2 border-brand-primary`
- Badges: `rounded-full px-2 py-0.5 text-xs font-medium`
- Buttons: use existing Shadcn variants, add `brand` variant for CTAs
- Tables: `divide-y divide-border/50`, sticky header, row hover `bg-muted/30`
- Skeleton: pulse animation on every data-loading state (never show empty containers)

### New Dependencies to Install (Sprint 0)

```bash
# Landing package
pnpm --filter landing add recharts framer-motion react-calendar-heatmap date-fns
pnpm --filter landing add @radix-ui/react-progress @radix-ui/react-tabs @radix-ui/react-toggle-group
pnpm --filter landing add @radix-ui/react-tooltip @radix-ui/react-badge

# Types
pnpm --filter landing add -D @types/react-calendar-heatmap
```

---

## Sprint 0 — Foundation & Schema (Week 1)

**Goal:** All DB migrations land. SSE infrastructure bootstrapped. Design system committed.

### 0.1 Prisma Migrations

**File:** `packages/backend/prisma/schema.prisma`

#### A. Extend `Organization` — add timezone

```prisma
model Organization {
  // ... existing fields ...
  timezone   String    @default("UTC")   // IANA string e.g. "America/New_York"
}
```

#### B. Rewrite `OfflineTime` — full approval workflow

```prisma
enum OfflineTimeStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}

enum OfflineTimeSource {
  REQUEST       // user-initiated → goes through approval
  DIRECT_ADD    // manager-initiated → auto-approved
}

model OfflineTime {
  id              String            @id @default(uuid())
  org_id          String
  user_id         String            // who the time applies to
  requested_by_id String            // user_id (self) or manager_id (direct-add)
  approver_id     String?           // null until resolved
  source          OfflineTimeSource @default(REQUEST)
  status          OfflineTimeStatus @default(PENDING)
  start_time      DateTime
  end_time        DateTime
  description     String
  approver_note   String?           // required on REJECTED; 'Self-approved by Admin' on admin self-submit
  expires_at      DateTime?         // created_at + 30 days for PENDING; null otherwise

  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  organization Organization @relation(fields: [org_id], references: [id])
  user         User         @relation("UserOfflineTime", fields: [user_id], references: [id])
  requested_by User         @relation("RequestedOfflineTime", fields: [requested_by_id], references: [id])
  approver     User?        @relation("ApprovedOfflineTime", fields: [approver_id], references: [id])

  @@index([org_id, user_id, start_time])
  @@index([org_id, status])
  @@index([status, expires_at])  // used by EXPIRED cron query
}
```

#### C. Add `UserSettingsOverride`

```prisma
model UserSettingsOverride {
  id          String   @id @default(uuid())
  org_id      String
  user_id     String
  feature_key String   // validated by app-layer allowlist (VARCHAR 100)
  value       String   // serialized: "true" | "false" | "300" | etc.
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([org_id, user_id, feature_key])
  @@index([org_id, user_id])
}
```

#### D. Add `Streak`

```prisma
model Streak {
  id               String    @id @default(uuid())
  org_id           String
  user_id          String    @unique
  current_streak   Int       @default(0)
  longest_streak   Int       @default(0)
  last_active_date DateTime?
  updated_at       DateTime  @updatedAt

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([org_id])
}
```

#### E. Add `Notification`

```prisma
enum NotificationType {
  OFFLINE_TIME_SUBMITTED
  OFFLINE_TIME_APPROVED
  OFFLINE_TIME_REJECTED
  OFFLINE_TIME_EXPIRED
  OFFLINE_TIME_ALREADY_RESOLVED
  PAYMENT_DUE
}

model Notification {
  id         String           @id @default(uuid())
  org_id     String
  user_id    String
  type       NotificationType
  payload    Json             @default("{}")
  read_at    DateTime?
  created_at DateTime         @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, read_at, created_at])
  @@index([org_id, created_at])
}
```

#### F. Add relation fields to `User`

```prisma
model User {
  // ... existing ...
  user_settings_overrides UserSettingsOverride[]
  streak                  Streak?
  notifications           Notification[]
  offline_times_requested OfflineTime[] @relation("RequestedOfflineTime")
  offline_times_approved  OfflineTime[] @relation("ApprovedOfflineTime")
}
```

**Migration command:**

```bash
pnpm --filter backend exec prisma migrate dev --name "sprint0_offline_approval_settings_streak_notifications"
```

### 0.2 SSE Infrastructure (Backend)

**New file:** `packages/backend/src/lib/sse.ts`

```typescript
// In-process SSE registry. For 500 users, a Map<userId, Response[]> is sufficient.
// If you scale beyond 1 backend instance, replace with Redis pub/sub.

const connections = new Map<string, Set<ServerResponse>>()

export function registerSSE(userId: string, res: ServerResponse) { ... }
export function sendSSE(userId: string, event: string, data: unknown) { ... }
export function removeSSE(userId: string, res: ServerResponse) { ... }
```

**New route:** `GET /v1/app/notifications/stream`

- Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- Registers the response in the SSE registry
- Sends heartbeat `ping` every 25s to prevent proxy timeout
- Cleans up on `request.raw.on('close', ...)`

**New route:** `GET /v1/app/notifications` — returns last 50 unread notifications (for initial hydration on page load)

**New route:** `PATCH /v1/app/notifications/:id/read` — mark as read

### 0.3 Settings Resolution Util

**New file:** `packages/backend/src/lib/settings.ts`

```typescript
export const OVERRIDABLE_KEYS = [
  'ss_capture_interval_seconds',
  'ss_capture_enabled',
  'ss_delete_allowed',
  'ss_blur_allowed',
  'ss_click_notification_enabled',
  'jira_connected',
  'expected_daily_work_minutes',
] as const

export type OverridableKey = typeof OVERRIDABLE_KEYS[number]

export async function resolveFeature(
  orgId: string,
  userId: string | null,
  key: OverridableKey
): Promise<string> {
  // 1. UserSettingsOverride
  // 2. OrgSettings
  // 3. SystemDefaults (hardcoded object in this file)
  ...
}

export const SYSTEM_DEFAULTS: Record<OverridableKey, string> = {
  ss_capture_interval_seconds: '600',     // 10 minutes
  ss_capture_enabled: 'true',
  ss_delete_allowed: 'false',
  ss_blur_allowed: 'false',
  ss_click_notification_enabled: 'true',
  jira_connected: 'false',
  expected_daily_work_minutes: '480',     // 8 hours
}
```

### 0.4 Design System Commit

**File:** `packages/landing/app/globals.css`

- Add all color tokens from Design System section above
- Add custom animation keyframes: `fadeIn`, `slideUp`, `shimmer`
- Add `@layer utilities` helpers: `.text-balance`, `.scrollbar-hide`

**File:** `packages/landing/tailwind.config.ts`

- Extend `colors` with brand palette
- Extend `animation` with `fade-in`, `slide-up`
- Extend `borderRadius` with `2xl: 1rem`, `3xl: 1.5rem`

**Deliverables Sprint 0:**

- [ ] All 5 Prisma models migrated
- [ ] SSE endpoint live and tested with `curl`
- [ ] `resolveFeature()` utility with tests
- [ ] Design tokens committed, Storybook or test page showing palette

---

## Sprint 1 — Offline Time Approval Workflow (Week 2)

**Goal:** Full request → approval/rejection → notification cycle working end-to-end.

### 1.1 Backend API

**File:** `packages/backend/src/routes/offline-time.ts` — complete rewrite

| Method  | Route                              | Role              | Description                            |
| ------- | ---------------------------------- | ----------------- | -------------------------------------- |
| `POST`  | `/v1/app/offline-time/request`     | EMPLOYEE, MANAGER | Submit a REQUEST                       |
| `POST`  | `/v1/app/offline-time/direct-add`  | MANAGER, ADMIN    | DIRECT_ADD for a target user           |
| `GET`   | `/v1/app/offline-time`             | All               | List own offline time (paginated)      |
| `GET`   | `/v1/app/offline-time/pending`     | MANAGER, ADMIN    | List pending approvals for their scope |
| `PATCH` | `/v1/app/offline-time/:id/approve` | MANAGER, ADMIN    | Approve with optional note             |
| `PATCH` | `/v1/app/offline-time/:id/reject`  | MANAGER, ADMIN    | Reject with required note              |
| `GET`   | `/v1/admin/offline-time`           | ADMIN, OWNER      | All org offline time + audit view      |

**Business logic (enforce in service layer, not route handler):**

```
REQUEST flow:
  1. Create record: status=PENDING, source=REQUEST, expires_at=now+30d
  2. Find all teams user belongs to (TeamMember → Team → manager_id)
  3. Create Notification for each manager: type=OFFLINE_TIME_SUBMITTED
  4. SSE: sendSSE(managerId, 'notification', payload) for each manager
  5. Email to managers (enqueue to emailWorker)

DIRECT_ADD flow:
  1. Create record: status=APPROVED, source=DIRECT_ADD, approver_id=manager_id
  2. Create Notification for target user: type=OFFLINE_TIME_APPROVED
  3. SSE: sendSSE(userId, 'notification', payload)

APPROVE flow (atomic):
  1. UPDATE SET status=APPROVED, approver_id=? WHERE id=? AND status=PENDING
     → if 0 rows updated: fetch record, if APPROVED/REJECTED return 409 with resolver name
  2. Create Notification for user: type=OFFLINE_TIME_APPROVED
  3. SSE to user
  4. If multi-manager: create OFFLINE_TIME_ALREADY_RESOLVED notification for other managers

REJECT flow:
  1. Same atomic UPDATE with REJECTED + required approver_note
  2. Notify user

Admin self-submit:
  1. source=REQUEST, status=APPROVED, approver_id=self, approver_note='Self-approved by Admin'
  2. No notification needed (they approved themselves)

Manager self-submit:
  1. source=REQUEST, status=PENDING
  2. Notification goes to ADMIN/OWNER roles in org (not other managers)
```

### 1.2 EXPIRED Cron

**File:** `packages/backend/src/queues/workers/agentMaintenanceWorker.ts`

Add new job handler `expire-offline-requests`:

```typescript
if (job.name === 'expire-offline-requests') {
  const expired = await prisma.offlineTime.findMany({
    where: { status: 'PENDING', expires_at: { lt: new Date() } },
    select: { id: true, user_id: true, org_id: true },
  })
  // Batch update
  await prisma.offlineTime.updateMany({
    where: { id: { in: expired.map((r) => r.id) } },
    data: { status: 'EXPIRED' },
  })
  // Create EXPIRED notifications for each user
  await prisma.notification.createMany({
    data: expired.map((r) => ({
      org_id: r.org_id,
      user_id: r.user_id,
      type: 'OFFLINE_TIME_EXPIRED',
      payload: { offline_time_id: r.id },
    })),
  })
  // SSE each user
  for (const r of expired) sendSSE(r.user_id, 'notification', { type: 'OFFLINE_TIME_EXPIRED' })
  return { expired: expired.length }
}
```

**Register repeatable job in queue index:**

```typescript
await queue.add(
  'expire-offline-requests',
  {},
  {
    repeat: { cron: '0 2 * * *' }, // 02:00 UTC daily
    removeOnComplete: true,
  }
)
```

### 1.3 UI — Offline Time Pages

**Page:** `/myhome/offline-time` (new route)

**Layout:** Two-panel view

- **Left (60%):** Timeline of user's own offline time entries sorted by date
- **Right (40%):** "Submit Request" form (EMPLOYEE/MANAGER) + "Pending Approvals" list (MANAGER/ADMIN)

**Timeline Component** (`OfflineTimeTimeline`):

```
Visual design:
- Vertical timeline with date separators
- Each entry = card with left status indicator bar:
  - PENDING    → amber/yellow (#F59E0B)
  - APPROVED   → emerald (#10B981)
  - REJECTED   → red (#EF4444)
  - EXPIRED    → slate (#94A3B8)
- Entry card shows: date range, duration, reason, approver name (if resolved)
- REJECTED entries show approver note in red italic below
- Animate in with framer-motion: `initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}`
```

**Submit Request Form:**

```
Fields:
- Date (date picker, no future dates beyond 30 days)
- Duration: hour/minute inputs (not a time picker — cleaner)
- Reason: textarea with 200 char limit + counter
- Submit button with loading state

Validation:
- start + duration cannot overlap an existing APPROVED entry for same user
- End time must be in the past
```

**Manager Pending Approvals Panel:**

```
Only visible to MANAGER, ADMIN, OWNER roles.
Shows count badge on nav item.

Each pending card:
- User avatar + name + team
- Date + duration
- Reason (collapsible if >2 lines)
- Approve (green) / Reject (red) buttons
- Reject opens inline note textarea before confirming

"Already resolved" state: if another manager acted first,
card grays out and shows "Resolved by [Name]" inline.
```

**Deliverables Sprint 1:**

- [ ] All 7 API endpoints with tests
- [ ] Atomic approve/reject with 409 conflict handling
- [ ] EXPIRED cron registered and tested
- [ ] SSE events firing on approve/reject
- [ ] `/myhome/offline-time` page with timeline + submit + pending panels
- [ ] Nav badge showing pending count for managers

---

## Sprint 2 — Settings Architecture (Week 3)

**Goal:** Two-tier settings fully working. Org Admin can override any overridable feature per user.

### 2.1 Backend API

| Method   | Route                                   | Role         | Description                                      |
| -------- | --------------------------------------- | ------------ | ------------------------------------------------ |
| `GET`    | `/v1/admin/settings`                    | ADMIN, OWNER | Get org settings + all user overrides            |
| `PATCH`  | `/v1/admin/settings`                    | ADMIN, OWNER | Update org-level settings                        |
| `GET`    | `/v1/admin/settings/users/:userId`      | ADMIN, OWNER | Get all overrides for a specific user            |
| `PUT`    | `/v1/admin/settings/users/:userId/:key` | ADMIN, OWNER | Set or update a user override                    |
| `DELETE` | `/v1/admin/settings/users/:userId/:key` | ADMIN, OWNER | Delete override (revert to org default)          |
| `GET`    | `/v1/app/settings/me`                   | All          | Get effective settings for self (resolved chain) |

**`resolveFeature` integration:** Every desktop agent config pull must go through the resolution chain. Update `GET /v1/agent/config` to call `resolveFeature` for each overridable key per user.

### 2.2 UI — Per-User Settings Overrides

**Location:** `/myhome/organization/settings` — extend existing page

**Add new tab: "Per-User Overrides"**

**Layout:**

```
User search/filter at top (existing user list search pattern)
Selected user shows a settings panel below:

┌─────────────────────────────────────────────────┐
│  [Avatar] Sarah Johnson  ·  Employee             │
│  ─────────────────────────────────────────────  │
│  Screenshot Interval   [Org default: 10 min] ↓  │
│  ○ Use org default                               │
│  ● Override:  [____] minutes                     │
│                                                  │
│  Screenshot Capture    [Org default: Enabled] ↓  │
│  ○ Use org default                               │
│  ● Override:  [ON] [OFF]                         │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

**Component:** `UserOverridePanel`

- Toggles between "Use org default" and "Override" for each key
- Shows org default value as ghost text for context
- Save indicator: auto-saves on blur/toggle with a checkmark animation
- Unsaved changes: `useBeforeUnload` guard

**Indicator in User List:** users with active overrides get a small badge `override` on their row in `/myhome/organization/users`

**Deliverables Sprint 2:**

- [ ] 5 API endpoints with Zod validation + feature_key allowlist enforcement
- [ ] `resolveFeature` called on every agent config response
- [ ] Per-User Overrides tab in org settings
- [ ] Auto-save with optimistic UI
- [ ] Override indicator badge in user list
- [ ] `GET /v1/app/settings/me` used by desktop app on startup

---

## Sprint 3 — Email Pipeline & Streak Cron (Week 4)

**Goal:** Scheduled reports sending correctly in org timezone. Streaks updating daily.

### 3.1 Scheduled Email Reports

**New worker:** `packages/backend/src/queues/workers/reportEmailWorker.ts`

**Queue name:** `report-emails`

**Jobs:**

```
weekly-user-report      → cron: every Monday, per org at 08:00 org TZ
weekly-manager-report   → cron: every Monday, per org at 08:00 org TZ
monthly-manager-report  → cron: 1st of month, per org at 08:00 org TZ
monthly-admin-report    → cron: 1st of month, per org at 08:00 org TZ
payment-due-notice      → cron: 1st of month, triggered by billing system
```

**Timezone-aware scheduling:** On org creation and on org TZ update, register/update the org's repeatable jobs:

```typescript
async function registerOrgReportJobs(orgId: string, timezone: string) {
  const monday8amCron = convertTo UTC cron for org's 08:00 Monday using timezone
  await reportEmailQueue.add('weekly-user-report', { orgId }, {
    repeat: { cron: monday8amCron },
    jobId: `weekly-user-${orgId}`,  // prevents duplicate registration
    removeOnComplete: true,
  })
  // ... same for monthly jobs
}
```

**Report generation (per job execution):**

```
weekly-user-report:
  1. Query all ACTIVE users in org
  2. For each user: get time_sessions from prev Mon 00:00 → Sun 23:59 (org TZ)
  3. Compute: total_hours, top_project, daily_breakdown, streak
  4. Batch send via Resend (50 users per batch, 100ms delay between batches)
  5. Zero-activity users: send report with 0h + "No time tracked this week" CTA

weekly-manager-report:
  1. Query all MANAGER users in org
  2. For each manager: aggregate their assigned users' sessions
  3. Include: team total, per-user breakdown, top performer, total offline time used

monthly-admin-report:
  1. Single email to all ADMIN/OWNER in org
  2. Include: org total hours, user count, new users, integration sync status
```

**Email Templates (new):**

All templates share a base layout:

```
Header: TrackSync logo + week/month range
Body: metric cards in a responsive 2-column grid
Footer: "Manage notifications" link + unsubscribe (admin only)
```

Template: `weekly-user-report.tsx`

```
┌─────────────────────────────────────────┐
│  👋 Hi Sarah — your week in review      │
│  March 24 – March 30, 2026              │
├────────────┬────────────┬───────────────┤
│ 32h 15m    │ 7 day str. │ Top: Backend  │
│ This week  │ 🔥 Streak  │ 18h 30m      │
├─────────────────────────────────────────┤
│ Daily breakdown (bar chart inline SVG)  │
│ Mon ████████ 7h                         │
│ Tue ██████   5h 15m                     │
│ ...                                     │
└─────────────────────────────────────────┘
```

> Use inline CSS + SVG for email compatibility — no external assets.

### 3.2 Payment Due Notification

**New route:** `POST /v1/platform/billing/notify` (Super Admin or internal cron only)

**Logic:**

- Find all orgs where `trial_ends_at` is within 7 days, or monthly billing date is upcoming
- Create `Notification` type=`PAYMENT_DUE` for each ADMIN/OWNER in org
- Enqueue email to `emailWorker`
- Super Admin receives platform summary: X orgs with upcoming payments

### 3.3 Streak Cron

**Add job to** `agentMaintenanceWorker.ts`:

```
job name: 'calculate-streaks'
cron: '5 0 * * *'  (00:05 UTC daily, after midnight activity is settled)

Logic for each user:
  yesterday = date in user's timezone
  had_activity = any TimeSession with started_at on yesterday in user TZ AND duration_sec > 0

  if had_activity:
    streak.current_streak += 1
    streak.longest_streak = max(current, longest)
    streak.last_active_date = yesterday
  else if last_active_date < yesterday - 1 day:
    streak.current_streak = 0  (streak broken)
  // if last_active_date == yesterday-1: carry forward (no change, just not incremented yet)

  upsert Streak for each user
```

**Deliverables Sprint 3:**

- [ ] `reportEmailWorker` with 5 job types
- [ ] Timezone-aware cron registration on org create/update
- [ ] All 4 email templates (HTML + inline CSS)
- [ ] Zero-activity email tested (0h report sends correctly)
- [ ] Payment due notification endpoint + email
- [ ] Streak cron running, `Streak` table populating correctly
- [ ] Streak data surfaced on `GET /v1/app/dashboard` response

---

## Sprint 4 — Dashboard Redesign (Week 5)

**Goal:** Replace the current polling dashboard with a professional, data-rich bento layout.

> Current: basic stat cards + user list table with 15s polling  
> Target: bento grid, live data, activity heatmap, team status ring

### 4.1 Design Spec — Dashboard Layout

**Route:** `/myhome/dashboard` (existing, full rewrite of `page.tsx`)

**Grid system:** CSS Grid bento layout, 12 columns, responsive

```
Desktop (≥1280px):
┌─────────┬─────────┬────────────────────┐
│ Total   │ Active  │                    │
│ Hours   │ Users   │  Activity Heatmap  │
│ Today   │ Now     │  (52 weeks)        │
├─────────┼─────────┤                    │
│ Top     │ Streak  │                    │
│ Project │ 🔥 7d   ├────────────────────┤
├─────────┴─────────┤ Team Status Ring   │
│ Weekly Hours      │ (per user online   │
│ Area Chart        │  indicator)        │
│ (7 days)          │                    │
├───────────────────┴────────────────────┤
│ User Activity Table (full width)       │
│ [sortable, filterable, live status]    │
└────────────────────────────────────────┘

Tablet (768–1279px): 2-col grid, heatmap below charts
Mobile: single column, heatmap hidden
```

### 4.2 Component Specs

#### `ActivityHeatmap` (new)

```typescript
// Uses react-calendar-heatmap
// 52 weeks of data (1 year lookback)
// Color scale: 0h=bg-muted, <2h=brand-primary/20, <4h=brand-primary/50, 4h+=brand-primary
// Tooltip on hover: "[Date]: 4h 32m tracked"
// Filtered to current user's org (admin sees aggregate, user sees self)

Props:
  data: { date: string, value: number }[]  // value = seconds tracked
  colorScale: 4-step from muted to brand-primary
  tooltipFormatter: (date, value) => string
```

#### `WeeklyAreaChart` (new)

```typescript
// Uses recharts AreaChart
// 7-day rolling window, re-fetches on mount
// X-axis: Mon Tue Wed Thu Fri Sat Sun (abbreviations)
// Y-axis: hours (0 to max+1)
// Fill: gradient from brand-primary/40 to brand-primary/0
// Animated on mount: animationDuration={800}
// Tooltip: custom styled tooltip showing hours:mins
```

#### `TeamStatusGrid` (new — Manager/Admin only)

```typescript
// Replaces existing user list as secondary view
// 3-column grid of user status cards (or 2-col on tablet)
// Each card:
//   [Avatar ring: green=online, amber=idle, gray=offline]
//   [Name + role badge]
//   [Today: Xh Ym]
//   [Latest screenshot thumbnail — 48×32 blurred-on-hover]
//   [Activity bar — current hour activity score as progress bar]

// Online = last heartbeat < 5min
// Idle = last activity > idle_timeout_minutes
// Real-time: SSE stream for status updates (use existing heartbeat data)
```

#### `StatCard` (upgrade existing)

```typescript
// Keep structure, upgrade visuals:
// Add: left border accent (2px colored by type: blue=time, violet=users, emerald=streak)
// Add: trend indicator (vs yesterday): ▲ +12% in green or ▼ -3% in red
// Add: sparkline (tiny 7-day recharts LineChart, no axes, 60px wide)
// Loading: skeleton pulse, not empty containers
```

#### `TopNav` upgrades

```
Add to right side of nav:
- Notification bell with unread count badge (from SSE stream)
- Click opens Notification Center slide-over
```

### 4.3 Navigation Upgrade

**File:** whatever renders the sidebar/nav in `(dashboard)/myhome/layout.tsx`

**Redesigned nav structure:**

```
Dashboard          /myhome/dashboard
───────────────
My Time            /myhome/time
Screenshots        /myhome/screenshots
Reports            /myhome/reports
Offline Time       /myhome/offline-time    [badge: pending count]
───────────────
[MANAGER+ only]
Team               /myhome/team
───────────────
[ADMIN+ only]
Organization ▾
  Users            /myhome/organization/users
  Teams            /myhome/organization/team
  Settings         /myhome/organization/settings
  Audit Log        /myhome/organization/audit
───────────────
Settings           /myhome/settings
```

**Nav styling:**

- Active item: `bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary`
- Inactive: `text-muted-foreground hover:bg-muted/50 hover:text-foreground`
- Icons: Lucide, 16px, `shrink-0`
- Section dividers: `<hr className="border-border/50 my-2">`
- Badge: `rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-[18px]`

### 4.4 SSE Connection (Client)

**New hook:** `packages/landing/hooks/useSSE.ts`

```typescript
// Establishes EventSource to /v1/app/notifications/stream
// Reconnects on error with exponential backoff (1s, 2s, 4s, max 30s)
// Parses events: { type, payload }
// Dispatches to global notification store (Zustand or React context)
// Cleans up EventSource on unmount
```

**New store:** `packages/landing/stores/notificationStore.ts`

```typescript
// Zustand store
// state: { notifications: Notification[], unreadCount: number }
// actions: addNotification, markRead, markAllRead
// Hydrates from GET /v1/app/notifications on mount
// Appends from SSE stream in real-time
```

**Deliverables Sprint 4:**

- [ ] Bento dashboard layout (responsive: 12-col → 2-col → 1-col)
- [ ] `ActivityHeatmap` with 52-week data + tooltip
- [ ] `WeeklyAreaChart` with gradient fill + animation
- [ ] `TeamStatusGrid` with online/idle/offline rings
- [ ] Upgraded `StatCard` with trend % and sparkline
- [ ] SSE hook + notification store
- [ ] Nav redesign with role-based sections + pending badge
- [ ] Manager-only sections hidden for EMPLOYEE role

---

## Sprint 5 — Manager Dashboard & Team View (Week 6)

**Goal:** Managers have their own view. Team management is visual, not just a table.

### 5.1 Manager Dashboard Page

**Route:** `/myhome/team` (new, MANAGER+ only)

**Design:**

```
┌─────────────────────────────────────────────────┐
│  Your Team  ·  5 members                         │
│  [Filter: All | Online | Offline | At Risk]       │
├─────────────────────────────────────────────────┤
│  Team Summary Row:                               │
│  [Total hrs today] [Avg this week] [Pending req] │
├─────────────────────────────────────────────────┤
│  User Cards Grid (2-col on desktop, 1-col mobile)│
│                                                  │
│  ┌──────────────────────┐ ┌────────────────────┐│
│  │ [Avatar] John Doe    │ │ [Avatar] Sarah K.  ││
│  │ EMPLOYEE · Online    │ │ EMPLOYEE · Idle    ││
│  │ Today: 4h 12m        │ │ Today: 1h 02m      ││
│  │ Week:  22h 40m       │ │ Week:  8h 15m  ⚠️  ││
│  │ Streak: 🔥 12 days   │ │ Streak: 1 day      ││
│  │ [Screenshot thumb]   │ │ [Screenshot thumb] ││
│  │ [View Details] [···] │ │ [View Details] [···]││
│  └──────────────────────┘ └────────────────────┘│
└─────────────────────────────────────────────────┘
```

**"At Risk" filter:** users below 50% of their `expected_daily_work_minutes` by 3pm org TZ.

**`[···]` dropdown actions (MANAGER):**

- Add offline time for this user
- View full report
- View screenshots
- (Admin only) Adjust settings

### 5.2 Individual User Detail Page

**Route:** `/myhome/[userId]` — upgrade existing page

**Current:** minimal, shows some stats  
**New layout:**

```
Header:
  [Large avatar] [Name] [Role badge] [Status pill: Online/Offline/Idle]
  [Email] [Manager: Name] [Since: date]
  [Action buttons: Message (future) | Add Offline Time | View Screenshots]

Tab bar:
  Overview | Time | Screenshots | Activity | Reports

Overview tab:
  - 2×2 stat grid: Today / This Week / This Month / Streak
  - Weekly area chart (same component as dashboard)
  - Recent offline time entries (last 3, "View all" link)

Time tab:
  - Calendar month view: each day colored by hours tracked
  - Click day: expand to session list for that day
  - Session card: project, duration, device, start/end time

Screenshots tab:
  - Masonry grid (3-col desktop, 2-col tablet, 1-col mobile)
  - Each card: thumbnail, taken_at, activity score badge
  - Hover: show full timestamp + score details
  - Click: lightbox modal with navigation
  - "Blurred" screenshots show blur overlay with lock icon

Activity tab:
  - Hourly bar chart for selected date (default: today)
  - Date picker to navigate
  - App usage list: pie chart + ranked list of active_app values
  - URL tracking list (if enabled)

Reports tab:
  - Date range picker
  - Export button (CSV, PDF — reuse existing `/v1/reports/export`)
```

### 5.3 Screenshot Gallery Lightbox

**New component:** `ScreenshotLightbox`

```typescript
Props: { screenshots: Screenshot[], initialIndex: number, onClose: () => void }

Features:
- Full-screen overlay with backdrop blur
- Navigation: arrow keys + on-screen buttons
- Shows: full-res image, taken_at, activity_score ring, session info
- Keyboard: Escape=close, ←/→=navigate
- Blur indicator: "Blurred by policy" with admin unlock (if admin role)
- Admin actions: Delete screenshot (with confirmation)
- Animation: crossfade between images (Framer Motion AnimatePresence)
```

**Deliverables Sprint 5:**

- [ ] `/myhome/team` manager dashboard with user cards + filters
- [ ] "At Risk" computation + filter
- [ ] Individual user detail page with 4 tabs
- [ ] Session calendar month view
- [ ] Screenshot masonry grid + lightbox
- [ ] Activity hourly chart + app usage pie

---

## Sprint 6 — Reports & Data Visualization (Week 7)

**Goal:** Reports page is the single source of truth for time data. Charts are publication-quality.

### 6.1 Reports Page Redesign

**Route:** `/myhome/reports` (new route — currently reports are under user detail)

**For EMPLOYEE:** shows own data only  
**For MANAGER:** can switch between self / any assigned user / team aggregate  
**For ADMIN:** can switch between any user / team / entire org

**Layout:**

```
┌─────────────────────────────────────────────────┐
│  Reports                                         │
│  [User selector] [Date range] [Granularity]      │
│  [Export CSV] [Export PDF]                       │
├─────────────────────────────────────────────────┤
│  Summary row: Total | Daily avg | Top project    │
├──────────────────────┬──────────────────────────┤
│  Time Trend          │  Project Distribution     │
│  (Area chart)        │  (Donut chart)            │
│  Daily/Weekly/Monthly│  Hours per project        │
├──────────────────────┴──────────────────────────┤
│  App Usage                                       │
│  (Horizontal bar chart, top 10 apps)             │
├─────────────────────────────────────────────────┤
│  Time Sessions Table                             │
│  [sortable: date, duration, project, device]     │
│  [pagination: 25 per page]                       │
└─────────────────────────────────────────────────┘
```

**Charts spec:**

`TimeTrendChart` (recharts AreaChart):

- X-axis: dates (format by granularity: day=`Mon 24`, week=`Week 13`, month=`Mar`)
- Y-axis: hours
- Multiple series: stacked by project (different colors)
- Brush component at bottom for zooming
- Tooltip: date + breakdown by project

`ProjectDonut` (recharts PieChart with inner radius):

- Center label: total hours
- Legend: right-aligned, with color swatches
- Hover: highlight slice, show % and hours in tooltip
- Max 8 slices, rest = "Other"

`AppUsageChart` (recharts BarChart horizontal):

- App icon (first-letter avatar, no external fetching)
- Bar fills from left, colored by usage category (work/system/other)
- Tooltip: app name + hours + % of tracked time

### 6.2 Export Improvements

Existing `GET /v1/reports/export` — add PDF option:

- Use `@sparticuz/chromium` + `puppeteer-core` in a BullMQ worker
- Render report as HTML template, convert to PDF
- Return presigned S3 URL for download
- 5-minute URL expiry

**Deliverables Sprint 6:**

- [ ] `/myhome/reports` page with role-based user selector
- [ ] All 3 chart components (TimeTrend, ProjectDonut, AppUsage)
- [ ] Date range picker with presets (today, this week, this month, last month, custom)
- [ ] Granularity toggle (daily / weekly / monthly)
- [ ] PDF export via worker + S3 presigned URL
- [ ] Mobile-responsive (charts stack vertically, table horizontal scroll)

---

## Sprint 7 — Notification Center & Admin Polish (Week 8)

**Goal:** Notifications feel real-time. Admin settings UI is the best-in-class for a monitoring tool.

### 7.1 Notification Center UI

**Component:** `NotificationCenter` (slide-over panel)

**Trigger:** Bell icon in top nav (with unread count badge)

**Design:**

```
┌────────────────────────────────┐
│  Notifications           [✕]   │
│  [Mark all read]               │
├────────────────────────────────┤
│  Today                         │
│  ┌────────────────────────┐   │
│  │ 🕐 Offline time        │   │
│  │ John's request was     │   │
│  │ approved by Sarah K.   │   │
│  │ 2 minutes ago          │   │
│  └────────────────────────┘   │
│  ┌────────────────────────┐   │
│  │ ⚠️  New request        │   │
│  │ Mike requested 2h      │   │
│  │ offline on Apr 3       │   │
│  │ [Approve] [Reject]     │   │  ← inline actions for managers
│  └────────────────────────┘   │
│  Yesterday                     │
│  ...                           │
└────────────────────────────────┘
```

**Animation:** slides in from right with Framer Motion  
**Inline actions:** MANAGER notifications for `OFFLINE_TIME_SUBMITTED` show approve/reject buttons — clicking calls API, removes card from list with fade-out animation  
**Real-time:** new notifications push to top with slide-down animation via SSE  
**Persistence:** `read_at` timestamp set on open + per-item mark read

### 7.2 Organization Settings Polish

**File:** `/myhome/organization/settings/page.tsx`

**Redesigned tab structure:**

```
Tabs: General | Screenshots | Activity | Integrations | Per-User Overrides | Security
```

**General tab:**

- Org name, timezone selector (searchable, grouped by region), plan indicator

**Screenshots tab:**

```
Screenshot Interval
[  10  ] minutes
[  ─────────────●──  ] slider (1min → 60min, steps: 1,5,10,15,30,60)

Screenshot Capture     [ON / OFF toggle]
Screenshot Blur        [ON / OFF toggle]
User can delete own    [ON / OFF toggle]
Click notification     [ON / OFF toggle]
Retention period       [  90  ] days
```

**Activity tab:**

- Keyboard weight, Mouse weight, Movement weight (three sliders, auto-normalize to 1.0)
- Activity calc interval
- Idle timeout
- Preview: "With these weights, 60 keystrokes/min = X% activity score"

**Security tab:**

- MFA required for Admins [ON/OFF]
- MFA required for Managers [ON/OFF]
- Session timeout (not yet implemented — note as future)

**Visual polish for all tabs:**

- Section headers with subtle dividers
- Descriptions under each setting in `text-muted-foreground text-sm`
- Save state: each section has its own save button (not one global save)
- Toast on save: Sonner toast, bottom-right, auto-dismiss 3s

### 7.3 Audit Log Upgrade

**Route:** `/myhome/organization/audit`

**Current:** basic table  
**New design:**

```
Filter bar:
  [Actor dropdown] [Action type dropdown] [Date range] [Search]

Timeline view (not a flat table):
  Each day = group header
  Each entry = row with:
    - [Actor avatar] [Actor name]
    - [Action verb chip colored by category:
        settings=blue, user=violet, security=red, integration=green]
    - "changed screenshot_interval from 300 to 600"
    - [IP address — gray, monospace]
    - [Timestamp — relative]

Row expansion: click to see `old_value` / `new_value` diff (JSON diff view)
```

**Deliverables Sprint 7:**

- [ ] `NotificationCenter` slide-over with inline approve/reject
- [ ] SSE-connected unread badge + real-time new notifications
- [ ] Redesigned org settings with 5 tabs
- [ ] Sliders for screenshot interval and activity weights
- [ ] Audit log timeline view with colored action chips
- [ ] JSON diff expansion on audit log rows

---

## Sprint 8 — Super Admin Dashboard (Week 9)

**Goal:** Super Admin has a platform-level command center, not just a list of orgs.

### 8.1 Super Admin Dashboard

**Routes:** `/admin/*` (existing, full redesign)

**Seed script:** `packages/backend/scripts/seed-super-admin.ts`

```typescript
// Usage: pnpm --filter backend exec tsx scripts/seed-super-admin.ts
// Creates User with is_platform_admin=true, org_id=null (after making nullable)
// Generates TOTP secret (base32), prints QR code URL to terminal
// Prints: email, temp password (hashed in DB), TOTP setup URL
// MFA mandatory: middleware rejects if is_platform_admin && !mfa_enabled
```

**Layout: `/admin` → `/admin/dashboard` (new)**

```
┌─────────────────────────────────────────────────┐
│  TrackSync Platform Admin                        │
│  [Super Admin badge] [Logout]                    │
├─────────────┬───────────────────────────────────┤
│  Sidebar    │  Main content                      │
│  Dashboard  │                                    │
│  Orgs       │  Platform Overview                 │
│  Users      │  ┌──────┬──────┬──────┬──────┐   │
│  Billing    │  │Total │Active│Trial │Susp. │   │
│  Audit      │  │Orgs  │Users │Orgs  │Orgs  │   │
│             │  └──────┴──────┴──────┴──────┘   │
│             │                                    │
│             │  Orgs by Plan (Donut)              │
│             │  ┌─────┬─────────────────────┐    │
│             │  │TRIAL│████████  12          │    │
│             │  │STD  │████████████  28      │    │
│             │  │PRO  │████  8               │    │
│             │  └─────┴─────────────────────┘    │
│             │                                    │
│             │  Recent Org Activity               │
│             │  [table: org, users, last_active,  │
│             │   plan, status, actions]           │
└─────────────┴───────────────────────────────────┘
```

**`/admin/orgs` (upgrade):**

- Card grid (not flat table) for each org
- Card shows: org name, plan badge, user count, status, last_active
- Status pill: ACTIVE=green, SUSPENDED=red, TRIAL=amber
- Actions: Edit | Suspend/Unsuspend | View Users | Impersonate Admin (future)
- "New Org" button → opens slide-over (not a separate page)

**Create Org slide-over:**

```
Fields:
  Org name
  Org slug (auto-generated from name, editable)
  Plan selector (radio: TRIAL / STANDARD / PROFESSIONAL)
  Admin email (will receive welcome email)
  Admin name
  Timezone
  [Create Organization button]

On submit:
  1. Create Organization
  2. Create User (OWNER role, is_platform_admin=false)
  3. System generates temp password
  4. Enqueue welcome email to new admin
  5. Show success toast: "Org created. Welcome email sent to admin@example.com"
```

**`/admin/billing` (new):**

- Table of all orgs with plan, trial_ends_at, payment status
- Send manual payment due notification button per org
- Platform billing summary (for Super Admin's own tracking)

### 8.2 Super Admin Auth Hardening

**Middleware update:** `requirePlatformAdmin` middleware should check:

```typescript
if (user.is_platform_admin && !user.mfa_enabled) {
  return reply.status(403).send({
    code: 'MFA_REQUIRED',
    message: 'Platform admins must enable MFA before accessing this resource',
  })
}
```

**Login flow for Super Admin:**

- Same `/login` page
- After password → MFA challenge (same existing TOTP flow)
- JWT claim: `{ is_platform_admin: true }` → redirect to `/admin/dashboard`
- Platform admin sessions: stricter token TTL (15 min, same as others — blacklist handles instant revoke)

**Deliverables Sprint 8:**

- [ ] `seed-super-admin.ts` script with TOTP setup output
- [ ] MFA mandatory enforcement for `is_platform_admin` users
- [ ] `/admin/dashboard` with platform stats + org plan donut
- [ ] `/admin/orgs` card grid with create slide-over
- [ ] `/admin/billing` table with manual payment notification
- [ ] Org suspend/unsuspend with immediate session invalidation for all org users

---

## Sprint 9 — Desktop Polish & Jira Per-Org Rate Limiting (Week 10)

**Goal:** Desktop agent is reliable at 500 users. Jira sync won't get rate-limited.

### 9.1 SS Click Notification (Desktop)

**File:** `packages/desktop/src/main/screenshots/index.ts` (or wherever capture is triggered)

After successful screenshot capture + local save:

```typescript
if (settings.ss_click_notification_enabled) {
  new Notification({
    title: 'TrackSync',
    body: 'Screenshot captured',
    silent: true,
    icon: path.join(__dirname, '../../resources/icon.png'),
  }).show()
}
```

`settings.ss_click_notification_enabled` must come from resolved settings via `GET /v1/app/settings/me` — fetched on agent startup and cached for 5 minutes.

### 9.2 Jira Per-Org Rate Limiting

**File:** `packages/backend/src/queues/workers/integrationSync.ts`

**Current risk:** naïve loop over all orgs at same time → all hit Jira API simultaneously  
**Fix:**

```typescript
// Use jobId to prevent duplicate queuing
// Use BullMQ's rate limiter per org

// On sync schedule:
for (const org of orgsWithJira) {
  await integrationSyncQueue.add(
    'jira-sync',
    { orgId: org.id },
    {
      jobId: `jira-sync-${org.id}`, // prevents duplicate if prev still running
      removeOnComplete: { age: 3600 },
      removeOnFail: { count: 3 },
    }
  )
}

// In worker job handler:
// After Jira API call, check response headers:
const remaining = parseInt(response.headers['x-ratelimit-remaining'] ?? '100')
const resetMs = parseInt(response.headers['x-ratelimit-reset'] ?? '0') * 1000
if (remaining < 10) {
  const delay = Math.max(resetMs - Date.now(), 5000)
  await job.moveToDelayed(Date.now() + delay)
  return // will be re-processed after delay
}
// Handle 429:
if (response.status === 429) {
  throw new Error('RATE_LIMITED') // BullMQ retry handles this
}
```

**BullMQ retry config for Jira sync:**

```typescript
{
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 }  // 10s, 20s, 40s, 80s, 160s
}
```

### 9.3 Desktop UI Polish

**Timer Page improvements:**

```
Current: basic timer display
Add:
- Activity score ring (circular progress, updates every 30s)
- Screenshot countdown: "Next screenshot in Xm Ys" (arc timer)
- Today's total prominently displayed below timer
- Streak indicator: 🔥 7 days (from /v1/app/dashboard)
```

**App Settings Page:**

```
Add sections:
- Notifications: toggle SS click notification (reflects UserSettingsOverride)
- Display: always on top toggle, minimize to tray toggle
- Jira: show sync status (last synced X minutes ago)
```

**Deliverables Sprint 9:**

- [ ] SS click notification using resolved settings
- [ ] Jira per-org BullMQ job dedup via `jobId`
- [ ] 429 back-off + exponential retry on Jira sync
- [ ] Desktop timer page: activity ring + screenshot countdown
- [ ] Desktop settings page with notification toggle

---

## Sprint 10 — QA, Load Testing & Production Hardening (Week 11)

**Goal:** System is provably correct under 500-user load. No regressions.

### 10.1 Load Testing (k6)

**Scenarios to test:**

| Scenario                                                   | Target                 | Pass criteria                |
| ---------------------------------------------------------- | ---------------------- | ---------------------------- |
| 500 concurrent active users polling dashboard              | p95 < 500ms            | No 5xx                       |
| 50 managers loading team view simultaneously               | p95 < 800ms            | No 5xx                       |
| 500 SSE connections held open                              | Memory < 512MB backend | No dropped events            |
| Screenshot sync burst (50 agents uploading simultaneously) | p95 < 2s               | S3 upload success rate > 99% |
| Report export (10 concurrent PDF exports)                  | p95 < 15s              | All exports succeed          |
| Email batch (500 weekly emails)                            | Completion < 5min      | All queued, Resend accepts   |

**Key indexes to add if slow (check `EXPLAIN ANALYZE` first):**

```sql
-- For dashboard team summary queries
CREATE INDEX CONCURRENTLY idx_time_sessions_org_user_started
  ON time_sessions(org_id, user_id, started_at DESC);

-- For streak calculation
CREATE INDEX CONCURRENTLY idx_streaks_org
  ON streaks(org_id);

-- For notification queries
CREATE INDEX CONCURRENTLY idx_notifications_user_unread
  ON notifications(user_id, read_at, created_at DESC)
  WHERE read_at IS NULL;
```

### 10.2 Security Audit Checklist

- [ ] All `org_id` on every Prisma query (no cross-tenant data leak)
- [ ] Manager can only see users in their assigned teams (verified in `GET /team-summary`)
- [ ] `UserSettingsOverride` writes reject unknown `feature_key` values
- [ ] SSE endpoint validates auth before establishing connection
- [ ] Offline time approve/reject validates requester is manager of target user's team
- [ ] PDF export presigned URL is not guessable (UUID in S3 key)
- [ ] Super Admin endpoints all have `requirePlatformAdmin` guard
- [ ] Notification SSE only streams to the authenticated user (no broadcast leaks)
- [ ] OfflineTime approve atomic UPDATE is truly atomic (test with concurrent requests)

### 10.3 Regression Tests

**New integration tests to write:**

```typescript
// packages/backend/src/__tests__/offline-time.test.ts
describe('Offline Time Approval', () => {
  it('approve is atomic — concurrent approvals from 2 managers return 1 success 1 409')
  it('EXPIRED cron correctly sets status and notifies user')
  it('manager cannot approve offline time for user not in their team')
  it('admin self-submit is auto-approved without notification')
  it('DIRECT_ADD skips PENDING state')
})

// packages/backend/src/__tests__/settings.test.ts
describe('Settings Resolution Chain', () => {
  it('resolveFeature returns UserOverride when set')
  it('resolveFeature falls back to OrgSettings when no override')
  it('resolveFeature falls back to SystemDefault when no org setting')
  it('unknown feature_key returns 400')
})

// packages/backend/src/__tests__/sse.test.ts
describe('SSE Notifications', () => {
  it('approve sends SSE to target user')
  it('new request sends SSE to all team managers')
  it('already-resolved sends SSE to late manager with resolver info')
})
```

### 10.4 Monitoring & Observability

**Add to existing Prometheus metrics:**

- `offline_time_requests_total{status}` — counter
- `sse_connections_active` — gauge (update in registerSSE/removeSSE)
- `report_email_sent_total{type}` — counter
- `jira_sync_duration_seconds` — histogram
- `streak_calculations_total` — counter

**Alerts to set (if using Grafana/Alertmanager):**

- `sse_connections_active > 600` → scale warning
- `jira_sync_duration_seconds p95 > 30` → Jira API degraded
- `report_email_sent_total rate < expected` → email pipeline broken

**Deliverables Sprint 10:**

- [ ] k6 load test scripts for all 6 scenarios, all passing
- [ ] All missing DB indexes added after `EXPLAIN ANALYZE`
- [ ] Security checklist 100% verified
- [ ] Integration tests for offline time, settings resolution, SSE
- [ ] Prometheus metrics for new systems
- [ ] Zero open P0/P1 bugs before production deploy

---

## Full Feature Matrix — Sprint Mapping

| Feature                                                          | Sprint  | Status          |
| ---------------------------------------------------------------- | ------- | --------------- |
| Auth (JWT + MFA + Redis blacklist)                               | —       | ✅ Already done |
| RBAC 5-role system                                               | —       | ✅ Already done |
| Screenshot capture + storage                                     | —       | ✅ Already done |
| Activity tracking                                                | —       | ✅ Already done |
| Jira Cloud integration                                           | —       | ✅ Already done |
| Email (Resend + BullMQ)                                          | —       | ✅ Already done |
| Audit logging                                                    | —       | ✅ Already done |
| Schema migrations (OfflineTime, Settings, Streak, Notifications) | **S0**  | 🔲              |
| SSE infrastructure                                               | **S0**  | 🔲              |
| Settings resolution util                                         | **S0**  | 🔲              |
| Design system + new dependencies                                 | **S0**  | 🔲              |
| Offline time full approval workflow                              | **S1**  | 🔲              |
| EXPIRED cron                                                     | **S1**  | 🔲              |
| Offline time UI (timeline + submit + pending)                    | **S1**  | 🔲              |
| UserSettingsOverride API                                         | **S2**  | 🔲              |
| Per-user settings override admin UI                              | **S2**  | 🔲              |
| Scheduled email reports (weekly + monthly)                       | **S3**  | 🔲              |
| Email templates (4 new)                                          | **S3**  | 🔲              |
| Payment due notification                                         | **S3**  | 🔲              |
| Streak daily cron                                                | **S3**  | 🔲              |
| Bento dashboard redesign                                         | **S4**  | 🔲              |
| ActivityHeatmap component                                        | **S4**  | 🔲              |
| WeeklyAreaChart + TeamStatusGrid                                 | **S4**  | 🔲              |
| SSE client hook + notification store                             | **S4**  | 🔲              |
| Nav redesign (role-based + badges)                               | **S4**  | 🔲              |
| Manager team dashboard                                           | **S5**  | 🔲              |
| Individual user detail page (4 tabs)                             | **S5**  | 🔲              |
| Screenshot masonry grid + lightbox                               | **S5**  | 🔲              |
| Reports page with 3 chart types                                  | **S6**  | 🔲              |
| PDF export via Puppeteer worker                                  | **S6**  | 🔲              |
| Notification center slide-over (inline actions)                  | **S7**  | 🔲              |
| Org settings redesign (5 tabs + sliders)                         | **S7**  | 🔲              |
| Audit log timeline view                                          | **S7**  | 🔲              |
| Super Admin seed script + MFA enforcement                        | **S8**  | 🔲              |
| Super Admin dashboard + billing                                  | **S8**  | 🔲              |
| Create org slide-over                                            | **S8**  | 🔲              |
| SS click notification (desktop)                                  | **S9**  | 🔲              |
| Jira per-org rate limiting + retry                               | **S9**  | 🔲              |
| Desktop timer polish (activity ring + countdown)                 | **S9**  | 🔲              |
| Load testing (k6, 6 scenarios)                                   | **S10** | 🔲              |
| Security audit                                                   | **S10** | 🔲              |
| Integration tests (offline time, settings, SSE)                  | **S10** | 🔲              |

---

## Critical Path

```
S0 (Schema + SSE + Design System)
  ├── S1 (Offline Time)     → S7 (Notification Center)
  ├── S2 (Settings)         → S9 (Desktop: resolved settings)
  ├── S3 (Email + Streaks)
  └── S4 (Dashboard)        → S5 (Manager View)
                             → S6 (Reports)
                             → S7 (Notification Center)
S8 (Super Admin) — can run in parallel with S5/S6
S9 (Desktop + Jira) — can run in parallel with S7/S8
S10 (QA) — blocks production deploy
```

**S0 is the hard dependency for everything. Start there. All other sprints can overlap with 2 engineers.**

---

## Environment Additions Needed

```bash
# Add to packages/backend/.env.example

# Org timezone scheduling
TZ=UTC  # server process timezone — always UTC, use org.timezone for user-facing

# PDF export (Sprint 6)
CHROMIUM_PATH=          # leave empty to use @sparticuz/chromium auto-download

# (All other env vars already defined in existing .env.example)
```

---

_Plan authored April 2026. Revisit after Sprint 5 to adjust S6–S10 scope based on sprint velocity._
