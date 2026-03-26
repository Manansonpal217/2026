# TrackSync — Phase-Wise Development Plan

> **Stack:** Electron + React (Desktop) · Node.js + Fastify + TypeScript (Backend) · Next.js (Admin/Employee Panel)  
> **Methodology:** Ship a vertical slice per phase — each phase delivers working, testable software, not just backend scaffolding.

---

## Overview

| Phase | Name                      | Duration   | Deliverable                                                |
| ----- | ------------------------- | ---------- | ---------------------------------------------------------- |
| 0     | Project Setup & DevOps    | Week 1–2   | Repo, CI/CD, infra skeleton                                |
| 1     | Auth + Org Foundation     | Week 3–6   | Login works end-to-end on all 3 layers                     |
| 2     | Time Tracking Core        | Week 7–10  | Employee can track time, sessions saved locally + server   |
| 3     | Screenshot + Activity     | Week 11–14 | Screenshots captured, encrypted, uploaded; activity scored |
| 4     | Integration Engine        | Week 15–18 | Jira + Asana connected; tasks sync; work logged            |
| 5     | Admin Panels V1           | Week 19–22 | Org admin sees all data; super admin manages orgs          |
| 6     | Billing + Feature Flags   | Week 23–25 | Stripe billing live; org suspension works; settings push   |
| 7     | GDPR + Security Hardening | Week 26–27 | Consent, data export, MFA, rate limits, CSP                |
| 8     | Polish + Beta             | Week 28–30 | Dark mode, shortcuts, employee portal, manual time entry   |
| 9     | Scale + Launch            | Week 31–36 | More integrations, self-serve signup, DR, observability    |

---

## Phase 0 — Project Setup & DevOps (Week 1–2)

> **Goal:** Every developer can clone, run, and deploy in under 30 minutes. CI/CD runs on every PR.

### Backend

- [ ] Initialize monorepo structure: `packages/backend`, `packages/desktop`, `packages/web`
- [ ] Fastify app scaffold with TypeScript, `tsx` for hot-reload
- [ ] Prisma setup with initial empty schema + `DATABASE_URL` env
- [ ] Docker Compose: PostgreSQL 15 + Redis for local dev
- [ ] `pnpm` workspaces configured
- [ ] ESLint + Prettier + `@typescript-eslint` across all packages
- [ ] Husky pre-commit hooks (lint-staged)

### Desktop App

- [ ] Electron 32 app scaffold: `electron-vite` (Vite + Electron + React + TypeScript)
- [ ] `electron-builder.yml` configured (mac + win + linux targets)
- [ ] Context isolation + preload script setup (secure IPC bridge)
- [ ] `better-sqlite3` installed and opening a test DB in main process
- [ ] `keytar` installed and verified on macOS/Windows

### Web Admin Panel

- [ ] Next.js 14 app scaffold with App Router + TypeScript
- [ ] TailwindCSS + shadcn/ui initialized
- [ ] React Query (TanStack Query) + Axios configured
- [ ] `next.config.js` with all security headers (CSP, HSTS, X-Frame-Options)

### DevOps / CI

- [ ] GitHub repository + branch protection (main requires PR + passing CI)
- [ ] GitHub Actions CI: lint → type-check → test on every PR
- [ ] GitHub Actions Release: electron-builder builds on version tag push
- [ ] AWS account bootstrap: S3 buckets, IAM roles, KMS keys, Secrets Manager entries
- [ ] Staging environment on ECS Fargate (1 task, RDS t3.micro)
- [ ] Environment variable template: `.env.example` for all three packages

**Definition of Done:** `pnpm dev` starts all three services. CI passes on a blank PR.

---

## Phase 1 — Auth + Org Foundation (Week 3–6)

> **Goal:** A super admin can log in, create an org, invite an employee, and the employee can log into the desktop app.

### Backend — Auth & Org APIs

- [ ] **Database schema** — Prisma migrations for: `organizations`, `users`, `org_settings`, `refresh_tokens`, `audit_logs`
- [ ] `POST /v1/public/auth/signup` — org self-serve signup (email verification flow)
- [ ] `POST /v1/app/auth/login` — email/password login (bcrypt, rate limit 5/5min/IP)
- [ ] `POST /v1/app/auth/refresh` — refresh token rotation
- [ ] `POST /v1/web/auth/login` — admin panel login (same endpoint, different role check)
- [ ] `POST /v1/app/auth/logout` — JWT `jti` blacklist in Redis
- [ ] JWT issuer — RS256, includes `jti`, `sub`, `org_id`, `role`, 15-min expiry
- [ ] `authenticateRequest` middleware — JWT verify + Redis blacklist check
- [ ] `requireRole(...roles)` middleware — RBAC enforcement
- [ ] `GET /v1/app/auth/me` — return current user + org settings
- [ ] `POST /v1/admin/users/invite` — invite employee by email (BullMQ email job)
- [ ] `POST /v1/public/auth/verify-email` — accept invite + set password
- [ ] `GET /v1/app/org-settings` — return current org settings (cached in Redis, TTL 5min)
- [ ] Org settings defaults seeded on org creation

### Desktop App — Auth & Onboarding

- [ ] Login screen UI (email + password form)
- [ ] IPC handler: `auth:login` → calls backend, stores `access_token` + `refresh_token` in `keytar`
- [ ] Token refresh interceptor (auto-refresh before 15-min expiry)
- [ ] IPC handler: `auth:logout` → clears keychain, navigates to login
- [ ] On launch: read token from keychain → validate → navigate to main or login
- [ ] Org settings fetch + cache in local SQLite on login
- [ ] Consent gate screen — shown on first launch, records consent via `POST /v1/app/consent`
- [ ] "What TrackSync Sees" screen (Settings → Privacy)

### Web Admin Panel — Auth

- [ ] NextAuth.js configured with Credentials provider (calls `/v1/web/auth/login`)
- [ ] Login page (`/auth/login`) — email + password form
- [ ] Protected route middleware (`middleware.ts`) — redirect to login if unauthenticated
- [ ] Role guard: super_admin routes only accessible to super_admin
- [ ] `/admin/users/invite` page — send invite form

**Definition of Done:** Employee receives invite email, clicks link, sets password, logs into desktop app. Super admin can see the org in web panel.

---

## Phase 2 — Time Tracking Core (Week 7–10)

> **Goal:** Employee can start a timer on a task, pause/resume, and stop. Session is saved locally and synced to the server.

### Backend — Sessions & Tasks

- [ ] **Migrations:** `projects`, `tasks`, `time_sessions`, `local_sessions` structure aligned
- [ ] `GET /v1/app/projects` — list org's projects (with task counts)
- [ ] `GET /v1/app/projects/:id/tasks` — list tasks for a project (assignee filter)
- [ ] `POST /v1/app/sessions/sync` — bulk upsert sessions from desktop (dedup by `local_id`)
- [ ] `GET /v1/app/sessions/active` — check if server has an active session for this user/device
- [ ] `GET /v1/app/sessions/check-overlap` — check for time conflict
- [ ] Device registration: `device_id` stored in `users` or separate `devices` table
- [ ] Session deduplication: `UNIQUE(user_id, device_id, started_at)`

### Desktop App — Time Tracking

- [ ] **local SQLite schema** — `local_sessions` table created on DB open
- [ ] Project selector screen — list projects from local cache or API
- [ ] Task selector screen — search + filter tasks, show recent tasks
- [ ] Active tracking screen — timer display (updated every second from main process `timer:tick`)
- [ ] Main process timer (`ipcMain.handle('timer:start/pause/resume/stop')`) — runs in Node.js, not renderer
- [ ] Session lifecycle: start → local SQLite write → server sync
- [ ] Pause/resume — local SQLite `status` + elapsed time preserved
- [ ] Stop & Log screen — confirm duration, add notes, choose log destination
- [ ] **Task switching** — Switch Task button (no full stop required)
- [ ] Crash recovery — on launch, check for `status = 'active'` sessions, show recovery dialog
- [ ] Sync engine skeleton — detect online/offline, push `pending` sessions to server

### Desktop App — Offline Sync Engine

- [ ] `openLocalDb()` — `better-sqlite3-sqlcipher`, WAL mode, all PRAGMAs set
- [ ] `getDbEncryptionKey()` — `keytar` integration
- [ ] Sync loop: every 30s when online, push all `sync_status = 'pending'` sessions
- [ ] Exponential backoff on sync failure (1s → 2s → 4s → max 60s)
- [ ] Sync status indicator in tray icon (✅ synced / 🔄 syncing / ⚠️ offline)

**Definition of Done:** Start timer, kill the app, relaunch — session resumes from correct elapsed time. Session appears on backend when online.

---

## Phase 3 — Screenshot & Activity (Week 11–14)

> **Goal:** Screenshots captured, AES-encrypted, uploaded to S3 with grace-period deletion. Activity score computed per minute.

### Backend — Screenshots & Activity

- [ ] **Migrations:** `screenshots`, `activity_logs`, `user_baselines` tables
- [ ] `POST /v1/app/screenshots/upload` — accept multipart, store to S3 with KMS SSE, record in DB
  - Rate limit: 30 uploads / 10 min per user
  - Org-level quota: 10,000 / hour
- [ ] `GET /v1/app/screenshots/presigned-upload` — return S3 presigned PUT URL (preferred)
- [ ] `DELETE /v1/app/screenshots/:id` — delete within grace window (S3 + DB)
- [ ] `POST /v1/app/activity-logs` — bulk insert activity log rows (dedup by `session_id + recorded_at`)
- [ ] Rate limit: 10 batches / min per user
- [ ] `GET /v1/admin/screenshots` — org admin: browse screenshots by user/date
- [ ] Signed URL generation for screenshot viewing (CloudFront signed, 1h expiry)

### Desktop App — Screenshot Capture

- [ ] `screenshot:capture` IPC handler — `screenshot-desktop` → WebP compress → AES-256-GCM encrypt → write `.enc` file
- [ ] `screenshot:readForUpload` IPC handler — decrypt `.enc` → return Buffer → stream to S3
- [ ] `screenshot:delete` IPC handler — delete `.enc` file + mark DB record
- [ ] Screenshot scheduler — fires at `screenshot_interval` minutes when tracking active
- [ ] Grace period countdown — OS-level notification with action button (`new Notification()`)
  - macOS: action button "Delete Screenshot"
  - Windows: Toast action button
- [ ] `local_screenshots` SQLite table + sync engine integration (upload queue)

### Desktop App — Activity Tracking

- [ ] `iohook` setup in main process — keyboard count, mouse click count, mouse distance
- [ ] `active-win` — detect foreground application name
- [ ] Browser URL detection (optional, when `track_url = true`) — AppleScript on macOS, COM on Windows
- [ ] 60-second interval: snapshot counters → compute activity score → write to `local_activity_logs`
- [ ] User baseline calculation — seed defaults, recompute weekly from history
- [ ] Passive work boost — if `active_app` matches Zoom/Slack/browser, apply soft boost
- [ ] Activity bar on tracking screen (live update via `activity:update` IPC event)

**Definition of Done:** Take screenshot, see OS notification, delete it within grace period — no upload happens. Let it expire — appears in S3 and admin panel.

---

## Phase 4 — Integration Engine (Week 15–18)

> **Goal:** Org admin connects Jira, tasks appear in desktop app, time logged to Jira after session completes.

### Backend — Integration Engine

- [ ] **Migrations:** `integrations` (global catalog), `org_integrations`, `integration_sync_log`
- [ ] Plugin interface: `IIntegrationPlugin` — `getProjects()`, `getTasks()`, `logTime()`, `validateCredentials()`
- [ ] **Jira plugin:** OAuth 2.0 PKCE flow, `GET /v1/admin/integrations/jira/oauth/start`, callback handler
  - OAuth state: single-use enforcement (Redis `HSET used=false` → `used=true` on callback)
  - SSRF protection on domain input
  - KMS envelope encryption for `auth_data`
- [ ] **Asana plugin:** OAuth 2.0 flow
- [ ] **Google Sheets plugin:** OAuth 2.0 flow + spreadsheet ID config
- [ ] Integration sync scheduler (BullMQ): `integrationSyncQueue`, cron per org every 15 min
- [ ] BullMQ job deduplication: `jobId = sync:${org_id}:${integration_id}`
- [ ] Circuit breaker (opossum) for all external API calls
- [ ] `POST /v1/app/sessions/:id/log-work` — log time to selected integrations
- [ ] `GET /v1/app/tasks/search?q=` — full-text search across synced tasks
- [ ] Delta sync: only fetch tasks changed since `last_synced_at`
- [ ] User mapping: link TrackSync user to external tool user ID

### Desktop App — Work Log Submission

- [ ] Work Log screen — after Stop: show session summary + integration checkboxes (Jira, Sheets, etc.)
- [ ] IPC handler calls `POST /v1/app/sessions/:id/log-work`
- [ ] Success/failure toast per integration
- [ ] "Recent Sessions" quick-log (for sessions not yet logged)
- [ ] Task sync: pull updated tasks on app launch + every 15 min, store in `local_tasks` SQLite

**Definition of Done:** Connect Jira OAuth, start timer on Jira issue, stop timer, log work — Jira shows 2h15m logged to that issue.

---

## Phase 5 — Admin Panels V1 (Week 19–22)

> **Goal:** Org admin can view all team activity. Super admin can manage all orgs. Screenshots are viewable.

### Backend — Reporting & Admin APIs

- [ ] **RDS Read Replica** — `dbRead` Prisma client configured for all report endpoints
- [ ] `GET /v1/admin/reports/time-summary` — group by user/project/task, date range filter
- [ ] `GET /v1/admin/reports/activity-heatmap` — per-user, hourly activity grid
- [ ] `GET /v1/admin/reports/app-usage` — top applications breakdown
- [ ] `GET /v1/admin/screenshots?user_id=&date=` — screenshot browser
- [ ] `GET /v1/admin/screenshots/:id/view` — return CloudFront signed URL
- [ ] `GET /v1/admin/users` — list users with status, last active, today's hours
- [ ] `PATCH /v1/admin/sessions/:id` — admin session edit (requires `edit_reason`, writes audit log)
- [ ] `GET /v1/super-admin/orgs` — list all orgs with MRR, status, seat count
- [ ] `GET /v1/super-admin/orgs/:id` — org detail with settings, billing, users
- [ ] `GET /v1/super-admin/audit-log` — global audit log (all org actions)
- [ ] CSV export: `GET /v1/admin/reports/export?format=csv`
- [ ] PDF export: `GET /v1/admin/reports/export?format=pdf` (Puppeteer or PDFKit)

### Web Admin Panel — All Panels

- [ ] **Layout:** Sidebar navigation, role-aware menu items (super_admin vs org_admin vs manager)

#### Super Admin

- [ ] `/super-admin/dashboard` — MRR, active orgs, new orgs this month, recent audit log
- [ ] `/super-admin/orgs` — searchable org list table (status badge, seats, MRR, last active)
- [ ] `/super-admin/orgs/:id` — org detail: users tab, settings tab, billing tab, audit log tab
- [ ] Suspend / reinstate org (with reason modal)
- [ ] Override org settings (screenshots, intervals, integrations)

#### Org Admin

- [ ] `/admin/dashboard` — live tracking widget (who's tracking now), team hours today, recent sessions
- [ ] `/admin/users` — user list: invite, edit role, deactivate, bulk import CSV
- [ ] `/admin/users/:id` — user detail: sessions, screenshots, activity heatmap
- [ ] `/admin/reports` — time summary table + filters (date range, user, project)
- [ ] `/admin/screenshots` — screenshot grid browser (date/user filter, click to full-size)
- [ ] `/admin/integrations` — connect org integration (OAuth flow embedded)
- [ ] `/admin/settings` — feature flag toggles (screenshots, tracking, MFA policy)
- [ ] `/admin/approvals` — time approval queue (if `time_approval_required = true`)

#### Manager

- [ ] `/manager/dashboard` — own team only (same as org admin but scoped)
- [ ] `/manager/approvals` — approve/reject team sessions

**Definition of Done:** Org admin logs into web panel, clicks on an employee, views today's screenshots in a grid, clicks one to full-size, sees activity heatmap for the week.

---

## Phase 6 — Billing + Feature Flags (Week 23–25)

> **Goal:** Stripe billing is live. Overdue payment suspends all desktop apps in real-time.

### Backend — Billing & WebSockets

- [ ] **Stripe integration:** `stripe` npm, webhook endpoint `POST /v1/webhooks/stripe`
  - Handle: `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] Org suspension on payment failure: `status = suspended`, broadcast via WebSocket
- [ ] Org reinstatement on payment: `status = active`, broadcast via WebSocket
- [ ] `POST /v1/admin/billing/subscribe` — create Stripe subscription (from onboarding wizard)
- [ ] `GET /v1/admin/billing/portal` — Stripe Customer Portal redirect
- [ ] Trial expiry cron (daily 9AM): 3-day warning email, `trial_expired` status on expiry
- [ ] `POST /v1/super-admin/orgs/:id/suspend` — manual suspend
- [ ] `POST /v1/super-admin/orgs/:id/reinstate` — manual reinstate
- [ ] **WebSocket server** (Socket.io + Redis adapter): `io.to('org:<id>').emit('org:suspended')`
- [ ] Feature flags: `GET /v1/app/org-settings` → cached in Redis, pushed via WebSocket on change
- [ ] `PATCH /v1/super-admin/orgs/:id/settings` — super admin overrides org settings → triggers WebSocket broadcast

### Desktop App — Real-time Settings & Suspension

- [ ] Socket.io client in renderer — auto-reconnect, re-fetch settings on reconnect
- [ ] Handle `org:suspended` — show suspension screen, stop all tracking, clear timer
- [ ] Handle `org:settings_changed` — apply new settings without app restart
- [ ] Handle `org:trial_expired` — show trial expired screen

### Web Admin Panel — Billing

- [ ] `/admin/billing` — current plan, seat count, next invoice, payment method
- [ ] Trial banner — "X days left in trial" with upgrade CTA
- [ ] Failed payment banner — "Payment failed — update billing to restore access"
- [ ] `/super-admin/billing` — MRR chart (Recharts), revenue by plan, failed payments list

**Definition of Done:** Set Stripe test card to fail → payment webhook fires → all employee desktop apps show suspension screen within 5 seconds → fix card → apps restore automatically.

---

## Phase 7 — GDPR + Security Hardening (Week 26–27)

> **Goal:** Legally compliant. Production security posture. Ready for enterprise evaluation.

### Backend

- [ ] **MFA module** (`backend/14-mfa.md`): TOTP setup, verify, backup codes
  - `POST /v1/web/auth/mfa/setup` + `POST /v1/web/auth/mfa/verify-setup`
  - `POST /v1/web/auth/mfa/validate` (after password login)
  - Mandatory for `super_admin`, policy-enforced for `org_admin`
- [ ] **AWS Secrets Manager** — replace all `process.env.X_KEY` secret refs with Secrets Manager fetch at startup
- [ ] Rate limiting audit — verify all upload + sync endpoints have per-user + per-org limits
- [ ] `POST /v1/app/consent` — record consent with `policy_version` + `tracking_config_hash`
- [ ] `GET /v1/app/my-data/export` — full data export (JSON/CSV zip)
- [ ] `POST /v1/app/my-data/delete-request` — GDPR deletion request (30-day processing)
- [ ] `POST /v1/app/my-consent/withdraw` — revoke consent + force logout
- [ ] Data deletion BullMQ job — purge sessions, screenshots (S3), activity logs
- [ ] `data_region` routing middleware — route DB/S3 writes to correct region per org
- [ ] Screenshot retention lifecycle rule on S3 (based on `screenshot_retention_days`)
- [ ] Penetration testing checklist: SSRF, IDOR, XSS, CSRF, rate limit bypass

### Desktop App

- [ ] Re-consent flow — detect settings hash change → show consent screen before tracking resumes
- [ ] "What TrackSync Sees" screen fully implemented (dynamic based on current `org_settings`)

### Web Admin Panel

- [ ] MFA setup page (`/settings/security/mfa`) — QR code + backup codes display
- [ ] MFA login step (`/auth/mfa`) — TOTP input with backup code fallback
- [ ] GDPR admin view: pending deletion requests, process/acknowledge

**Definition of Done:** Run OWASP ZAP scan → zero high/critical findings. GDPR delete request flow tested end-to-end.

---

## Phase 8 — Polish + Beta (Week 28–30)

> **Goal:** App feels professional. 3 pilot organizations onboarded. Feedback incorporated.

### Desktop App

- [ ] **Dark mode** — `better-sqlite3` theme pref storage, system theme detection via `matchMedia`
- [ ] **Global keyboard shortcuts** — `Cmd+Shift+T` (toggle), `Cmd+Shift+P` (pause), `Cmd+Shift+M` (manual)
- [ ] **Manual time entry** screen — date picker, start/end or duration, overlap detection
- [ ] Settings → Keyboard Shortcuts — user-configurable shortcut rebinding
- [ ] Settings → Appearance — Light / Dark / System theme
- [ ] Settings → Notifications — toggle OS notification types
- [ ] App startup time optimization: lazy-load non-critical routes
- [ ] Idle detection — popup after N minutes of no activity: "Include idle time or discard?"
- [ ] Auto-update — `electron-updater` configured, update notification in settings

### Web Admin Panel

- [ ] **Dark mode** — `next-themes`, `ThemeToggle` component in header
- [ ] **Employee web portal** (`/employee/*`) — own sessions, screenshots, privacy controls
- [ ] **Self-serve signup** — `/signup` page (5-step onboarding wizard)
- [ ] **Time approval queue** (`/manager/approvals`) — UI for manager approve/reject
- [ ] **Project budget alerts** — budget % progress bar in project detail
- [ ] Admin session edit modal — PATCH with required reason
- [ ] Screenshot blur toggle per org (admin settings)
- [ ] Responsive layout polish (admin panel usable on tablet)

### Backend

- [ ] **Self-serve signup API** (`backend/13`) — disposable email block, data region assignment
- [ ] **Time approval APIs** (`backend/15`) — approve, reject, bulk-approve, auto-approve cron
- [ ] Project budget alert system — 80%/100% threshold emails

**Definition of Done:** 3 pilot orgs using it daily for 1 week. NPS > 7.

---

## Phase 9 — Scale + Launch (Week 31–36)

> **Goal:** Public launch. Infrastructure can handle 100 orgs / 2,000 employees without degradation.

### Additional Integrations

- [ ] **Linear plugin** — OAuth, issues as tasks, time tracking via API
- [ ] **ClickUp plugin** — OAuth, spaces/lists/tasks, time log
- [ ] **GitHub plugin** — OAuth, issues as tasks (no time log — GitHub has no native time tracking)
- [ ] **Tempo plugin** — connects to Jira Tempo for more accurate time logging
- [ ] **Trello plugin** — API key, boards/cards as tasks

### Infrastructure & Observability

- [ ] **RDS Proxy** — configure in AWS, update `DATABASE_URL` to proxy endpoint
- [ ] **RDS Read Replica** — provision, configure `DATABASE_READ_URL`
- [ ] **OpenTelemetry SDK** — install + configure in backend, BullMQ workers (`backend/18`)
  - Correlation IDs on all requests + BullMQ jobs
  - Datadog APM export
- [ ] **Sentry** — install in backend + web panel + Electron renderer
- [ ] **Datadog dashboards** — API latency p99, error rate, queue depth, DB connections, ECS tasks
- [ ] **PagerDuty** — P0/P1 alert escalation
- [ ] **Disaster Recovery drill** — test RDS failover, S3 restore, region failover runbook

### Public Launch Checklist

- [ ] Security audit (internal or third-party pen test)
- [ ] GDPR DPA (Data Processing Agreement) published
- [ ] Privacy Policy v1.0 published
- [ ] Terms of Service published
- [ ] Help docs / knowledge base (minimum: install guide, FAQ, integration guides)
- [ ] Status page (statuspage.io or betteruptime.com)
- [ ] macOS + Windows + Linux installation tested on clean machines
- [ ] App Store submission (macOS) — optional but increases trust
- [ ] Product Hunt launch preparation
- [ ] Pricing page live with Stripe checkout

**Definition of Done:** 10 paying orgs. System handles 500 concurrent desktop sessions without p99 latency exceeding 500ms.

---

## Dependency Graph (Critical Path)

```
Phase 0 (Setup)
    ↓
Phase 1 (Auth)          ← BLOCKS everything
    ├── Phase 2 (Time Tracking)
    │       ↓
    │   Phase 3 (Screenshots + Activity)
    │       ↓
    │   Phase 4 (Integrations)    ← needs sessions to log work
    │
    └── Phase 5 (Admin Panels)   ← needs sessions + screenshots data to display
            ↓
        Phase 6 (Billing + Flags)  ← needs org management + WebSocket
                ↓
            Phase 7 (Security)     ← needs all APIs to audit
                ↓
            Phase 8 (Polish)       ← needs working product to polish
                ↓
            Phase 9 (Scale + Launch)
```

---

## Tech Stack Quick Reference

| Layer                    | Package                           | Purpose                                 |
| ------------------------ | --------------------------------- | --------------------------------------- |
| Desktop framework        | `electron` 32+                    | Cross-platform desktop shell            |
| Desktop bundler          | `electron-vite`                   | Vite + Electron + React + TS            |
| Desktop packager         | `electron-builder`                | macOS DMG, Windows NSIS, Linux AppImage |
| Desktop local DB         | `better-sqlite3-sqlcipher`        | Encrypted SQLite, WAL mode              |
| Desktop keychain         | `keytar`                          | OS keychain (mac/win/linux)             |
| Desktop screenshots      | `screenshot-desktop`              | Cross-platform screen capture           |
| Desktop input monitor    | `iohook`                          | Global keyboard/mouse hooks             |
| Desktop active window    | `active-win`                      | Foreground app name + window title      |
| Desktop auto-start       | `electron-auto-launch`            | Launch at login                         |
| Desktop auto-update      | `electron-updater`                | Signed delta updates                    |
| Desktop notifications    | `electron` `Notification`         | OS-native notifications                 |
| Desktop global shortcuts | `electron` `globalShortcut`       | System-wide hotkeys                     |
| Backend runtime          | `node` 22 + `fastify` 5           | HTTP server                             |
| Backend ORM              | `prisma` + PostgreSQL 15          | Type-safe DB access                     |
| Backend queue            | `bullmq` + Redis                  | Background jobs                         |
| Backend WebSocket        | `socket.io` + Redis adapter       | Real-time push                          |
| Backend auth             | `jose` (JWT) + `bcrypt`           | RS256 JWTs + password hashing           |
| Backend storage          | `@aws-sdk/client-s3`              | S3 presigned URLs + KMS SSE             |
| Backend secrets          | `@aws-sdk/client-secrets-manager` | No plaintext secrets in env             |
| Backend circuit breaker  | `opossum`                         | External API failure isolation          |
| Backend observability    | `@opentelemetry/sdk-node`         | Distributed tracing                     |
| Backend error tracking   | `@sentry/node`                    | Error reporting                         |
| Web framework            | `next.js` 14 App Router           | Admin + Employee portal                 |
| Web auth                 | `next-auth`                       | Session management                      |
| Web UI                   | `tailwindcss` + `shadcn/ui`       | Component library                       |
| Web state                | `@tanstack/react-query`           | Server state management                 |
| Web charts               | `recharts`                        | Activity charts + MRR graphs            |
| Web theme                | `next-themes`                     | Dark/light/system mode                  |

---

## Environment Variables Checklist

### Backend (`.env`)

```bash
# Database
DATABASE_URL=                    # via AWS Secrets Manager in prod
DATABASE_READ_URL=               # RDS Read Replica (optional in dev)

# Redis
REDIS_URL=redis://localhost:6380

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=               # dev only — ECS uses IAM role in prod
AWS_SECRET_ACCESS_KEY=           # dev only
S3_BUCKET=tracksync-screenshots-staging
CLOUDFRONT_DOMAIN=dXXX.cloudfront.net
KMS_MASTER_KEY_ARN=arn:aws:kms:...
KMS_SCREENSHOTS_KEY_ARN=arn:aws:kms:...

# Auth
JWT_PRIVATE_KEY=                 # RS256 PEM — Secrets Manager in prod
JWT_PUBLIC_KEY=                  # RS256 PEM

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
SENDGRID_API_KEY=SG...
EMAIL_FROM=noreply@tracksync.io

# App
PORT=3001
NODE_ENV=development
APP_VERSION=0.1.0
```

### Desktop App (`.env`)

```bash
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

### Landing + dashboard (`.env.local` in `packages/landing`)

```bash
NEXTAUTH_URL=http://localhost:3002
NEXTAUTH_SECRET=                 # random 32-char secret
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_API_URL=http://localhost:3001
CLOUDFRONT_DOMAIN=dXXX.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=
CLOUDFRONT_PRIVATE_KEY=          # for signed URLs
```

---

## Testing Strategy Per Phase

| Phase            | Unit Tests               | Integration Tests         | E2E Tests                      |
| ---------------- | ------------------------ | ------------------------- | ------------------------------ |
| 1 (Auth)         | JWT utils, password hash | Login flow, token refresh | Login → dashboard (Playwright) |
| 2 (Time)         | Session dedup logic      | Sync endpoint             | Start timer → see on web       |
| 3 (SS)           | Encryption round-trip    | Upload + signed URL       | Capture → view in admin        |
| 4 (Integrations) | Plugin interface mocks   | OAuth callback            | Connect Jira → see tasks       |
| 5 (Admin)        | Report aggregations      | Screenshot browser        | Admin views employee session   |
| 6 (Billing)      | Stripe webhook handlers  | Suspension flow           | Fail payment → app suspended   |
| 7 (Security)     | Rate limiter             | MFA flow                  | OWASP ZAP scan                 |
| 8–9              | Regression suite         | Full smoke test           | Full user journey E2E          |

---

## Weekly Sprint Template

Each 2-week sprint delivers one complete sub-phase:

```
Week N (Sprint Planning)
  - Define acceptance criteria for each task
  - Assign backend, desktop, web tasks to team members
  - Create feature branch per major feature

Week N (Development)
  - Backend API first (unblocks desktop + web)
  - Desktop IPC handlers + UI in parallel with web
  - PR review required before merge to main

Week N+1 (Integration + Testing)
  - Connect desktop to newly built backend endpoints
  - Write integration tests for new API routes
  - Deploy to staging, smoke test manually
  - Update DEVELOPMENT_PLAN.md checkboxes
  - Retrospective: what was blocked, what to improve
```
