# TrackSync — Documentation Index

> Complete module-wise breakdown of the TrackSync SaaS platform.  
> Reference `main.md` for the full product plan and architecture overview.

---

## Structure

```
Docs/
  main.md                          ← Full product plan (source of truth)
  INDEX.md                         ← This file
  DEVELOPMENT_PLAN.md              ← Phase-wise build plan (Phase 0–9, all three layers)
  app/                             ← Desktop App (Electron + React) modules
  backend/                         ← Backend API (Node.js + Fastify) modules
  admin-panel/                     ← Web Admin Panel (Next.js) modules
  phases/                          ← Granular phase implementation files (one per phase)
    phase-00-setup.md              ← Monorepo scaffold, DevOps, CI/CD, AWS bootstrap
    phase-01-auth.md               ← JWT auth, org signup, invite flow, MFA
    phase-02-time-tracking.md      ← Timer engine, SQLite sync, sessions API
    phase-03-screenshots-activity.md ← Encrypted capture, activity scoring, S3 upload
    phase-04-integrations.md       ← Plugin engine, Jira/Asana OAuth, KMS encryption, circuit breaker
    phase-05-admin-panels.md       ← Reporting APIs, approval workflow, admin dashboard
    phase-06-billing-flags.md      ← Stripe webhooks, feature flags, WebSocket push
    phase-07-gdpr-security.md      ← Consent gate, data export/deletion, MFA enforcement, security headers
    phase-08-polish-beta.md        ← Manual entry, dark mode, shortcuts, auto-update, code signing
    phase-09-scale-launch.md       ← Observability, Google Sheets/Trello, infrastructure scaling, launch
```

---

## Desktop App Modules (`app/`)

| # | File | Description |
|---|------|-------------|
| 01 | `01-auth-onboarding.md` | Login, SSO, token storage, consent gate, macOS permissions onboarding |
| 02 | `02-settings-sync-feature-flags.md` | Org settings fetch, cache, WebSocket updates, transparency screen |
| 03 | `03-project-task-management.md` | Project/task list, local SQLite cache, delta sync |
| 04 | `04-time-tracking.md` | Timer (OS-level), session lifecycle, task switching, global shortcuts |
| 05 | `05-screenshot-capture.md` | AES-256 encrypted capture, OS-level notifications, grace period |
| 06 | `06-activity-tracking.md` | Keyboard/mouse/app monitoring, calibrated activity score, sync |
| 07 | `07-offline-sync-engine.md` | SQLCipher encrypted DB, WAL mode, sync orchestrator |
| 08 | `08-work-log-submission.md` | Log work to Jira/Asana/Sheets after session completes |
| 09 | `09-system-tray-notifications.md` | Tray icon, notifications, idle popup, org suspension UI |
| 10 | `10-cross-platform-permissions.md` | Permissions, keychain, code signing, Apple notarization, auto-update |
| 11 | `11-employee-privacy-portal.md` | GDPR data export, deletion request, consent withdrawal |
| 12 | `12-manual-time-entry.md` | Add time manually with date picker, overlap detection, external log |
| 13 | `13-dark-mode.md` | Dark/light/system theme for desktop app and web panels |

---

## Backend API Modules (`backend/`)

| # | File | Description |
|---|------|-------------|
| 01 | `01-auth-jwt.md` | Login, SSO, JWT (jti), MFA flow, rate limiting, /v1/ versioning |
| 02 | `02-organization-management.md` | Org CRUD, suspension, reinstatement, seat counting |
| 03 | `03-user-management.md` | User invite, roles, manager assignment, integration mapping |
| 04 | `04-feature-flags-settings.md` | Per-org settings, Redis cache, real-time push |
| 05 | `05-integration-engine.md` | Plugin system, OAuth (single-use state), SSRF protection, KMS encryption, circuit breaker |
| 06 | `06-time-sessions-api.md` | Session sync, device_id dedup, admin edit with audit log |
| 07 | `07-screenshots-s3.md` | Upload, KMS SSE-S3 encryption, signed URLs, configurable retention |
| 08 | `08-activity-logs.md` | Batch upload, deduplication, heatmap queries, privacy enforcement |
| 09 | `09-billing-stripe.md` | Stripe webhooks, trial expiry flow, grace period, suspension |
| 10 | `10-websocket-realtime.md` | Socket.io, rooms, settings push, org suspension events |
| 11 | `11-reporting-analytics.md` | Time reports, heatmaps, app usage, CSV/PDF, RDS read replica |
| 12 | `12-sync-queue.md` | BullMQ queues with job deduplication: integration sync, email, billing |
| 13 | `13-self-serve-signup.md` | Org signup, email verification, onboarding wizard |
| 14 | `14-mfa.md` | TOTP 2FA, backup codes, mandatory for super_admin, org policy |
| 15 | `15-time-approval.md` | Manager approval queue, auto-approve, reject with reason |
| 16 | `16-disaster-recovery.md` | RTO/RPO, Multi-AZ RDS, cross-region S3, runbooks |
| 17 | `17-secrets-management.md` | AWS Secrets Manager, IAM roles, rotation strategy |
| 18 | `18-observability.md` | OpenTelemetry, correlation IDs, Datadog APM, Sentry |

---

## Admin Panel Modules (`admin-panel/`)

| # | File | Description |
|---|------|-------------|
| 00 | `00-security-headers.md` | CSP, HSTS, X-Frame-Options, cookie hardening, signed URL policy |
| 01 | `01-super-admin-dashboard.md` | MRR metrics, org alerts, MRR chart, audit log feed |
| 02 | `02-organization-management.md` | Create/view/suspend/reinstate orgs, org detail tabs |
| 03 | `03-user-management.md` | Invite/edit/remove users, bulk import, user detail tabs |
| 04 | `04-feature-flags-control.md` | Per-org toggles, real-time push, change confirmation dialogs |
| 05 | `05-integration-management.md` | Connect org tool (OAuth/API key), global integration catalog |
| 06 | `06-billing-management.md` | Revenue dashboard, failed payments, trial expiry, Stripe Portal |
| 07 | `07-reports-screenshots.md` | Time/activity reports, heatmaps, screenshot browser, export |
| 08 | `08-org-admin-dashboard.md` | Live tracking, team hours today, recent sessions feed |
| 09 | `09-manager-panel.md` | Scoped team view, read-only time/activity/screenshots |
| 10 | `10-employee-portal.md` | Employee web portal: sessions, screenshots, privacy controls, GDPR |
| 11 | `11-time-approval.md` | Approval queue, admin session edit with audit log, project budgets |

---

## Phase Implementation Files (`phases/`)

Each file contains a full implementation guide for one phase: goal, prerequisites, npm packages to install, Prisma migrations, files to create, API endpoints with request/response shapes, IPC handler names, UI components, and a Definition of Done checklist.

| Phase | File | Week | Theme |
|-------|------|------|-------|
| 0 | `phase-00-setup.md` | 1–2 | Monorepo, DevOps, Docker, CI/CD, AWS bootstrap |
| 1 | `phase-01-auth.md` | 3–5 | JWT auth, org signup, invite flow, TOTP MFA |
| 2 | `phase-02-time-tracking.md` | 6–8 | Timer engine, SQLite local DB, session sync |
| 3 | `phase-03-screenshots-activity.md` | 9–11 | Encrypted screenshots, activity scoring, S3 |
| 4 | `phase-04-integrations.md` | 12–14 | Plugin engine, Jira/Asana OAuth, KMS, circuit breaker |
| 5 | `phase-05-admin-panels.md` | 15–18 | Reporting, approval queue, audit log, budget alerts |
| 6 | `phase-06-billing-flags.md` | 19–21 | Stripe billing, feature flags, WebSocket real-time |
| 7 | `phase-07-gdpr-security.md` | 22–24 | GDPR consent/export/deletion, MFA enforcement, headers |
| 8 | `phase-08-polish-beta.md` | 25–27 | Manual entry, dark mode, shortcuts, code signing, beta |
| 9 | `phase-09-scale-launch.md` | 28–32 | Observability, scaling, DR test, public launch |

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Local SQLite first** for time + screenshots | Zero data loss on network drop; session integrity guaranteed |
| **SQLCipher encryption for local.db** | Other processes on machine cannot read employee data |
| **AES-256-GCM screenshot files** | Screenshots never exist as plaintext on disk — encrypted before write |
| **Electron with lean main process** | Mature Node.js ecosystem in main process: `better-sqlite3`, `keytar`, `screenshot-desktop`, `electron-updater` — no custom native bindings needed |
| **SQLite WAL mode** (`better-sqlite3`) | Concurrent DB access (IPC handler thread + background sync) without blocking |
| **Plugin-based integrations** | Add new tools (Notion, Monday, etc.) without touching core code |
| **Circuit breaker for external APIs** | Prevents integration failures from cascading across all orgs |
| **BullMQ job deduplication** | Prevents duplicate Jira logs and race conditions on re-sync |
| **WebSocket for settings** | Sub-500ms settings change propagation; no app restart needed |
| **BullMQ for background jobs** | Retry, backoff, monitoring for integration sync and billing |
| **Redis for caching + pub/sub** | Settings cache (5-min TTL), WebSocket multi-instance support |
| **RDS Proxy for connection pooling** | Required at 5+ ECS instances; prevents PostgreSQL connection exhaustion |
| **RDS Read Replica for reports** | Reporting queries don't load the primary write DB |
| **S3 signed URLs + KMS SSE** | Screenshots never publicly accessible; encrypted at rest with audit trail |
| **Role-scoped all queries** | Manager never sees other teams' data — enforced in SQL, not just UI |
| **JWT jti claim** | Per-token blacklisting on logout — single-device logout without affecting other sessions |
| **KMS envelope encryption** | Integration credentials encrypted with per-secret data keys; master key in AWS KMS |
| **SSRF protection** | Integration domain validated against private IP ranges — prevents server-side request forgery |
| **/v1/ API versioning from day one** | Older desktop app versions continue working when API evolves |
| **Consent gate before tracking** | GDPR compliance — employee must consent to specific settings before tracking starts |
| **User-specific activity baselines** | Activity score calibrated to each employee's own history — no unfair comparison |
| **AWS Secrets Manager for all secrets** | No plaintext DB passwords or API keys in environment variables |
| **OpenTelemetry + correlation IDs** | Full request tracing across Fastify API → BullMQ workers → external APIs |
