# TrackSync Backend — Architecture Reference

This document describes the **current** `packages/backend` codebase as of the repository state when generated. Paths are relative to the monorepo root unless noted. Status markers:

- ✅ **[IMPLEMENTED]** — Present and wired for normal use
- ⚠️ **[PARTIAL]** — Code exists but incomplete, unwired, or behavior gaps
- ❌ **[NOT IMPLEMENTED]** — Absent from this codebase

---

## 1. Project Overview

### What is TrackSync?

TrackSync is a **multi-tenant B2B time-tracking and workforce-visibility product**. The backend stores organizations, users, projects/tasks, time sessions (including desktop sync), activity logs, screenshots (metadata + S3-compatible object storage), optional third-party **Jira Cloud** and **Asana** OAuth integrations (project/task sync and optional worklog push), org settings, audit logs, offline time, and platform-admin operations across tenants. Authentication is **email/password** with **JWT access tokens**, **refresh tokens** in Postgres, optional **TOTP MFA**, and a **platform admin** flag for cross-org APIs.

### Tech stack

| Layer                  | Technology                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Runtime                | Node.js (Dockerfile: `node:20-bookworm-slim`; local dev via `tsx`)                                             |
| Language               | TypeScript (`module: "type": "module"`)                                                                        |
| HTTP framework         | Fastify 5                                                                                                      |
| Validation             | JSON Schema (Fastify routes) + Zod (many handlers)                                                             |
| ORM                    | Prisma 5 → PostgreSQL                                                                                          |
| Primary cache / queues | Redis (ioredis) + **BullMQ**                                                                                   |
| Object storage         | AWS S3 API–compatible (`@aws-sdk/client-s3`; supports Cloudflare R2 via `S3_ENDPOINT`)                         |
| Crypto / integrations  | AWS KMS optional for integration tokens; AES-256-GCM fallback (`DB_ENCRYPTION_KEY`)                            |
| Email                  | **Resend** (`resend` package); SMTP vars exist in config but are **not** used for transactional mail in `src/` |
| Auth tokens            | `jose` (RS256 JWT)                                                                                             |
| Metrics                | `prom-client` (`/metrics`)                                                                                     |
| Error monitoring       | `@sentry/node` (optional via `SENTRY_DSN`)                                                                     |
| Image processing       | `sharp` (screenshot blur worker)                                                                               |

### Deployment target

- **Docker**: `packages/backend/Dockerfile` — multi-stage build, `CMD ["node", "dist/main.js"]`, exposes `3001`. Comments say to run Prisma migrations in CI/CD or an init container.
- **No** Railway/Render/AWS ECS config files were found **in-repo**; any cloud target is external configuration.

### Environment

- **Package manager**: pnpm (workspace; `pnpm --filter backend ...`)
- **Node**: 20 (per Dockerfile); `@types/node` ^20

---

## 2. Project Structure

```
packages/backend/
├── Dockerfile                 # Production container: Node 20, pnpm build, run dist/main.js
├── package.json               # Scripts: dev, build, start, test, prisma, utilities
├── vitest.config.ts           # Test runner config
├── .env.example               # Documented env vars (partial vs zod schema — see §13)
├── prisma/
│   ├── schema.prisma          # Full data model
│   └── migrations/            # Ordered SQL migrations (source of truth for DB history)
├── scripts/
│   ├── generate-keys.ts       # RSA key pair for JWT
│   ├── send-test-emails.ts    # Sends samples via Resend
│   └── test-s3-upload.ts      # S3 connectivity test
└── src/
    ├── main.ts                # Fastify app: plugins, /health, /metrics, /v1, workers
    ├── config.ts              # Zod-validated environment
    ├── metrics.ts             # Prometheus registry + HTTP histogram
    ├── db/
    │   ├── index.ts           # Re-exports
    │   ├── prisma.ts          # Singleton PrismaClient
    │   └── redis.ts           # Singleton Redis + JTI blacklist helpers
    ├── middleware/
    │   ├── index.ts           # Re-exports authenticate helpers
    │   └── authenticate.ts    # JWT auth, role/permission/platform checks, Redis user cache
    ├── lib/                   # Shared domain utilities
    │   ├── jwt.ts             # Issue/verify access + MFA-pending JWTs
    │   ├── password.ts        # bcrypt + refresh token hashing
    │   ├── mfa.ts             # TOTP + backup codes + QR
    │   ├── permissions.ts     # Role/permission matrix + org user access helpers
    │   ├── audit.ts           # Audit log writer
    │   ├── streak.ts          # User streak computation
    │   ├── s3.ts              # S3 client, presign, signed GET, delete
    │   ├── zoned-buckets.ts   # Time aggregation by user timezone
    │   ├── time-session-overlap.ts
    │   ├── screenshot-deleted-time.ts  # Deduction range when screenshot deleted
    │   ├── create-org-with-super-admin.ts
    │   ├── db-read.ts         # Optional read-replica Prisma client
    │   ├── email.ts           # Enqueue raw HTML/text email (BullMQ)
    │   └── integrations/      # Jira/Asana adapters, PKCE, SSRF guard, circuit breaker, registry, KMS
    ├── services/email/
    │   ├── emailService.ts    # Resend send + template wrappers
    │   ├── enqueue.ts         # Transactional email job types
    │   └── templates/         # HTML email templates
    ├── queues/
    │   ├── index.ts           # Queue getters + startWorkers()
    │   └── workers/           # BullMQ workers (email, screenshot, integration, time push, retention, budget)
    ├── routes/
    │   ├── v1.ts              # Registers all /v1 sub-routes
    │   ├── auth/              # login, refresh, logout, signup, verify, reset, invite, mfa
    │   ├── projects/, tasks/, sessions/, users/
    │   ├── screenshots/, activity/, offline-time.ts
    │   ├── integrations/
    │   ├── reports/
    │   ├── admin/
    │   ├── dashboard/
    │   └── platform/          # Cross-tenant (platform admin)
    └── __tests__/             # Vitest tests (unit/integration style)
```

**`dist/`** — Compiled JS output from `tsc` (not source of truth for behavior).

---

## 3. Database Schema

### ORM & migrations

- **ORM**: Prisma (`@prisma/client`)
- **Strategy**: SQL migrations under `prisma/migrations/`; `prisma migrate` workflow (see Dockerfile note)

### ENUM types

- Prisma schema uses **no** `enum` types; statuses/roles are **`String`** columns with application-level conventions.

### Tables (models)

#### `Organization`

| Column        | Type                          | Notes                             |
| ------------- | ----------------------------- | --------------------------------- |
| id            | String, PK, uuid              |                                   |
| name          | String                        |                                   |
| slug          | String, **unique**            |                                   |
| plan          | String, default `"trial"`     | No payment integration in code    |
| status        | String, default `"active"`    | e.g. suspended → HTTP 402 in auth |
| data_region   | String, default `"us-east-1"` | Metadata                          |
| trial_ends_at | DateTime?                     |                                   |
| trial_expired | Boolean, default false        |                                   |
| created_at    | DateTime                      |                                   |
| updated_at    | DateTime                      | @updatedAt                        |

**Relations**: users, org_settings, invites, projects, integrations, audit_logs, offline_times

**Indexes**: (implicit on slug)

---

#### `OrgSettings`

| Column                                                  | Type                   | Notes                                                                                                       |
| ------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| id                                                      | String, PK, uuid       |                                                                                                             |
| org_id                                                  | String, **unique**     | FK → Organization                                                                                           |
| screenshot_interval_seconds                             | Int, default 60        |                                                                                                             |
| screenshot_retention_days                               | Int, default 30        |                                                                                                             |
| blur_screenshots                                        | Boolean, default false |                                                                                                             |
| activity*weight*\*                                      | Float                  | keyboard, mouse, movement                                                                                   |
| track_keyboard, track_mouse, track_app_usage, track_url | Boolean                |                                                                                                             |
| time_approval_required                                  | Boolean, default false | ⚠️ Not enforced server-side on session create/reports (see §11)                                             |
| mfa_required_for_admins, mfa_required_for_managers      | Boolean                | ⚠️ Stored; ❌ not enforced on login                                                                         |
| idle_detection_enabled                                  | Boolean, default true  |                                                                                                             |
| idle_timeout_minutes                                    | Int, default 5         |                                                                                                             |
| idle_timeout_intervals                                  | Int, default 3         |                                                                                                             |
| expected_daily_work_minutes                             | Int, default 480       |                                                                                                             |
| allow_employee_offline_time                             | Boolean, default false | When true, employees’ own offline posts are approved immediately; when false, they submit pending requests. |

**FK**: org_id → Organization.id

⚠️ **PATCH `/v1/admin/settings`** does not expose `idle_*` fields (see §5).

---

#### `User`

| Column                 | Type                         | Notes                                                   |
| ---------------------- | ---------------------------- | ------------------------------------------------------- |
| id                     | PK uuid                      |                                                         |
| org_id                 | String                       | FK → Organization                                       |
| email                  | String                       |                                                         |
| password_hash          | String                       | bcrypt                                                  |
| role                   | String, default `"employee"` | super_admin, admin, manager, employee                   |
| manager_id             | String?                      | FK → User (SetNull on delete); same-org enforced in app |
| name                   | String                       |                                                         |
| timezone               | String, default UTC          |                                                         |
| status                 | String, default active       | active / suspended / etc.                               |
| mfa_enabled            | Boolean                      |                                                         |
| mfa_secret             | String?                      | legacy plaintext                                        |
| mfa_secret_encrypted   | Bytes?                       | preferred                                               |
| mfa_backup_codes       | String[], default []         |                                                         |
| is_platform_admin      | Boolean, default false       | Cross-org platform routes                               |
| can_add_offline_time   | Boolean?                     | null = inherit org setting                              |
| created_at, updated_at | DateTime                     |                                                         |

**Constraints**: `@@unique([email, org_id])`

**Indexes**: org_id; (org_id, status); email; manager_id

**Relations**: organization, manager, direct_reports, refresh_tokens, time_sessions, screenshots, activity_logs, audit_logs, tasks, offline_times (user + added_by)

---

#### `RefreshToken`

| Column     | Type               | Notes                              |
| ---------- | ------------------ | ---------------------------------- |
| id         | PK uuid            |                                    |
| user_id    | String             | FK → User                          |
| token_hash | String, **unique** | SHA-256 of raw token               |
| device_id  | String?            | ❌ Not set by login/refresh routes |
| expires_at | DateTime           | ~30 days from issue in auth routes |
| created_at | DateTime           |                                    |

**Indexes**: user_id; (user_id, expires_at)

---

#### `Invite`

| Column                                                                       | Type | Notes |
| ---------------------------------------------------------------------------- | ---- | ----- |
| id, org_id, email, role, token (unique), accepted_at, expires_at, created_at |      |       |

**Indexes**: org_id; (email, org_id); (org_id, accepted_at, expires_at)

---

#### `Project`

| Column                                                                   | Type | Notes |
| ------------------------------------------------------------------------ | ---- | ----- |
| id, org_id, name, color, archived, budget_hours?, created_at, updated_at |      |       |

**Indexes**: org_id; (org_id, archived)

**FK**: org_id → Organization

Integrated projects use synthetic ids `ext-{type}-{externalId}` (see integration worker).

---

#### `Task`

| Column                                                                                           | Type | Notes |
| ------------------------------------------------------------------------------------------------ | ---- | ----- |
| id, project_id, org_id, name, status (default open), external_id?, assignee_user_id?, timestamps |      |       |

**Indexes**: project_id; (project_id, status); org_id; assignee_user_id

**FK**: project (Cascade delete), assignee → User

---

#### `TimeSession`

| Column                                                             | Type                        | Notes                         |
| ------------------------------------------------------------------ | --------------------------- | ----------------------------- |
| id, user_id, org_id, project_id?, task_id?, device_id, device_name |                             |                               |
| started_at, ended_at?, duration_sec, is_manual, notes?             |                             |                               |
| approval_status                                                    | String, default `"pending"` | approved / rejected / pending |
| created_at, updated_at                                             |                             |                               |

**Unique**: `@@unique([user_id, device_id, started_at])`

**Indexes**: (user_id, started_at); (org_id, started_at); (project_id, started_at)

**FK**: user, project, task

**Relations**: screenshots, activity_logs, time_deductions

---

#### `Screenshot`

| Column                                                                       | Type        | Notes |
| ---------------------------------------------------------------------------- | ----------- | ----- |
| id, session_id, user_id, org_id, s3_key (unique), thumb_s3_key? (unique)     |             |       |
| taken_at, activity_score, is_blurred, file_size_bytes, thumb_file_size_bytes |             |       |
| deleted_at?, created_at, updated_at                                          | Soft delete |       |

**Indexes**: (user_id, taken_at); (org_id, taken_at); session_id; (org_id, deleted_at, taken_at)

---

#### `SessionTimeDeduction`

| Column                                                                                          | Type | Notes |
| ----------------------------------------------------------------------------------------------- | ---- | ----- |
| id, org_id, session_id, range_start, range_end, reason (default screenshot_deleted), created_at |      |       |

**FK**: session (Cascade delete)

**Indexes**: session_id; (org_id, session_id)

---

#### `Integration`

| Column                                                                                                                   | Type | Notes |
| ------------------------------------------------------------------------------------------------------------------------ | ---- | ----- |
| id, org_id, type, name, status (default active), auth_data (Bytes), kms_key_id, config (Json), last_sync_at?, timestamps |      |       |

**Indexes**: org_id; (org_id, type)

**Relations**: oauth_states

---

#### `OAuthState`

| Column                                                                                                            | Type | Notes |
| ----------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| id, integration_id?, org_id, state (unique), provider, redirect_uri, code_verifier?, used, expires_at, created_at |      |       |

**Indexes**: state; org_id

**FK**: integration optional

---

#### `AuditLog`

| Column                                                                                                       | Type | Notes |
| ------------------------------------------------------------------------------------------------------------ | ---- | ----- |
| id, org_id, actor_id, action, target_type, target_id, old_value?, new_value? (Json), ip_address?, created_at |      |       |

**Indexes**: (org_id, created_at); actor_id

**FK**: actor → User, organization → Organization

---

#### `ActivityLog`

| Column                                                                                                                                                            | Type | Notes |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| id, session_id, user_id, org_id, window_start, window_end, keyboard_events, mouse_clicks, mouse_distance_px, active_app?, active_url?, activity_score, created_at |      |       |

**Indexes**: (user_id, window_start); session_id; (org_id, window_start)

---

#### `OfflineTime`

| Column                                                                                      | Type | Notes |
| ------------------------------------------------------------------------------------------- | ---- | ----- |
| id, org_id, user_id, added_by_id, start_time, end_time, description, created_at, updated_at |      |       |

**Indexes**: (org_id, user_id, start_time); (org_id, start_time)

**FK**: organization, user, added_by → User

**OrgSettings (additional columns)**: `jira_projects`, `jira_issue_types`, `jira_statuses` (Json, default `[]`); `jira_time_logging_method` (String, default `jira_worklog`).

#### `AgentToken`

| Column                                                            | Type | Notes |
| ----------------------------------------------------------------- | ---- | ----- |
| id, org_id, token_hash (unique), name?, last_seen_at?, created_at |      |       |

**FK**: org → Organization. **Indexes**: org_id.

#### `AgentCommand`

| Column                                                                                                                                   | Type | Notes |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| id, org_id, user_id, type, status (default pending), payload (Json), attempts, error?, locked_at?, completed_at?, created_at, updated_at |      |       |

**FK**: organization, user. **Indexes**: (org_id, status), (org_id, created_at), (status, locked_at).

#### `AgentHeartbeat`

| Column                                                                                                      | Type | Notes |
| ----------------------------------------------------------------------------------------------------------- | ---- | ----- |
| id, org_id (unique), agent_version?, status (default online), last_seen_at, last_sync_at?, last_sync_count? |      |       |

**FK**: org → Organization.

#### `JiraIssue`

| Column                                                                                                                                  | Type | Notes |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| id, org_id, jira_id, key, summary?, status?, assignee_email?, priority?, due_date?, labels[], raw_payload (Json), synced_at, updated_at |      |       |

**Unique**: (org_id, jira_id). **Indexes**: org_id, (org_id, assignee_email).

---

## 4. Authentication & Authorization

### Auth method

- **JWT (RS256)** bearer access tokens + **opaque refresh tokens** stored hashed in `RefreshToken`
- **Not** session cookies for API (landing may use NextAuth separately)
- **OAuth** only for **Jira/Asana integrations**, not end-user login

### Token structure & expiry

**Access token** (`issueAccessToken` in `src/lib/jwt.ts`):

- `sub`: user id
- `jti`: random UUID (logout blacklist)
- `org_id`, `role`
- Expiry: **15 minutes**

**MFA pending token** (`issueMfaPendingToken`):

- `scope: "mfa_pending"`
- Expiry: **5 minutes**
- Rejected by normal `verifyToken` (throws path → 401 INVALID_TOKEN unless using MFA verify route)

**Refresh token**:

- Random string (`createRefreshToken`); **30 days** TTL in DB; one-time rotation on `/refresh` (delete old, create new)

### Middleware (`src/middleware/authenticate.ts`)

- `createAuthenticateMiddleware(config)` — Bearer JWT, JTI blacklist (Redis), user/org status (Redis cache 60s + DB on miss), attaches `user` + `org`
- `requireRole(...roles)` — 403 if role not in list
- `requirePermission(...Permission)` — uses `lib/permissions.ts`; `super_admin` bypasses
- `requirePlatformAdmin()` — requires `user.is_platform_admin === true` (from DB, not JWT)

### Role-based access control

- **Roles**: `super_admin`, `admin`, `manager`, `employee` (string column)
- **Permissions** (subset): settings (granular), offline time org/user, user manager assignment, suspend, role changes, `managers.access`
- **Visibility**: `super_admin` users hidden from non–super_admin peers in listings via `userWhereVisibleToOrgPeers`

### Org-level isolation

- JWT carries `org_id`; almost all queries add `org_id` from the authenticated user
- Platform routes intentionally **cross** orgs with `is_platform_admin`
- Helpers: `canAccessOrgUser`, `filterAccessibleUserIds`, `managerScopedUserIds` for manager scoping

---

## 5. API Endpoints

**Base URL**: API routes are mounted at **`/v1`** (except health/metrics).  
**Full path** = `/v1` + route file prefix + handler path.

### Health & metrics (no `/v1` prefix)

| Method | Path            | Auth | Description                  | Status |
| ------ | --------------- | ---- | ---------------------------- | ------ |
| GET    | `/health/live`  | No   | Liveness + `APP_VERSION`     | ✅     |
| GET    | `/health/ready` | No   | DB + Redis ping; 503 if fail | ✅     |
| GET    | `/health`       | No   | Deprecated alias of ready    | ✅     |
| GET    | `/metrics`      | No   | Prometheus text              | ✅     |

---

### `/v1/public/auth` (no JWT)

| Method | Path               | Body / query                                             | Response (summary)                | Status |
| ------ | ------------------ | -------------------------------------------------------- | --------------------------------- | ------ |
| POST   | `/signup`          | org_name, slug, full_name, email, password, data_region? | 201 message                       | ✅     |
| GET    | `/verify-email`    | query `token`                                            | message                           | ✅     |
| POST   | `/forgot-password` | email, org_slug?                                         | generic message                   | ✅     |
| POST   | `/reset-password`  | token, password                                          | message                           | ✅     |
| POST   | `/invite/accept`   | token, password; optional deprecated `full_name`         | 201 tokens + user                 | ✅     |
| GET    | `/invite/info`     | query `token`                                            | email, org_name, role, expires_at | ✅     |

**Who may assign which invited role** (`getAllowedInviteRoles` in `src/lib/permissions.ts` — enforced on `POST /public/auth/invite`, resend, and revoke):

| Caller (JWT `UserRole`) | May invite / manage invites for roles |
| ----------------------- | ------------------------------------- |
| OWNER                   | ADMIN, MANAGER, EMPLOYEE, VIEWER      |
| ADMIN                   | MANAGER, EMPLOYEE, VIEWER             |
| MANAGER                 | EMPLOYEE, VIEWER only                 |
| EMPLOYEE / VIEWER       | _(cannot create or resend invites)_   |

---

### `/v1/app/auth`

| Method | Path           | Auth | Body                       | Response (summary)                                                                                                                                                | Status |
| ------ | -------------- | ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| POST   | `/login`       | No   | email, password, org_slug? | tokens + user + org_settings **or** `mfa_required` + `mfa_token` **or** `403` `MFA_SETUP_REQUIRED` when org policy requires MFA for role and user has not enabled | ✅     |
| POST   | `/refresh`     | No   | refresh_token              | access_token, refresh_token, is_platform_admin                                                                                                                    | ✅     |
| POST   | `/logout`      | JWT  | refresh_token?             | message; blacklists JTI                                                                                                                                           | ✅     |
| GET    | `/me`          | JWT  | —                          | user, org, org_settings, authz (permissions, access_scope)                                                                                                        | ✅     |
| POST   | `/mfa/verify`  | No   | mfa_token, totp_code       | tokens + user                                                                                                                                                     | ✅     |
| POST   | `/mfa/setup`   | JWT  | —                          | qr_code_url, secret, uri                                                                                                                                          | ✅     |
| POST   | `/mfa/enable`  | JWT  | totp_code                  | message, backup_codes                                                                                                                                             | ✅     |
| POST   | `/mfa/disable` | JWT  | password, totp_code        | message                                                                                                                                                           | ✅     |

---

### `/v1` — Invites (authenticated)

| Method | Path                        | Auth                           | Body / params                                    | Notes                                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------- | ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/public/auth/invite`       | JWT + OWNER, ADMIN, or MANAGER | email, first_name, last_name, role?, manager_id? | Invited user’s display name = trimmed `first_name` + `last_name`. Role must be allowed for caller. For **EMPLOYEE**, `manager_id` is required: an active same-org user with role **OWNER**, **ADMIN**, or **MANAGER**; stored on the invite and applied as `User.manager_id` when the invite is accepted. |
| GET    | `/admin/invites`            | JWT + OWNER, ADMIN, or MANAGER | query: page, limit, status?, search?             | Lists org invites (includes `manager_id` and nested `line_manager` when set).                                                                                                                                                                                                                             |
| DELETE | `/admin/invites/:id`        | JWT + OWNER, ADMIN, or MANAGER | —                                                | Revoke pending invite; 403 if caller cannot assign that invite’s role.                                                                                                                                                                                                                                    |
| POST   | `/admin/invites/:id/resend` | JWT + OWNER, ADMIN, or MANAGER | —                                                | New token + email; 403 if caller cannot assign that invite’s role.                                                                                                                                                                                                                                        |

_(Create invite is under `public/auth` in `v1.ts` — full path `/v1/public/auth/invite`. List/resend/revoke are under `/v1/admin`.)_

---

### `/v1/projects`

| Method | Path   | Auth                    | Notes                        | Status |
| ------ | ------ | ----------------------- | ---------------------------- | ------ |
| POST   | `/`    | JWT + admin/super_admin | create project               | ✅     |
| GET    | `/`    | JWT                     | query: page, limit, archived | ✅     |
| GET    | `/:id` | JWT                     | includes open tasks          | ✅     |
| PATCH  | `/:id` | JWT + admin/super_admin |                              | ✅     |
| DELETE | `/:id` | JWT + admin/super_admin | sets archived true           | ✅     |

---

### `/v1/projects` (tasks — nested)

| Method | Path                | Auth | Status            |
| ------ | ------------------- | ---- | ----------------- | --- |
| GET    | `/tasks/search`     | JWT  | q, assigneeFilter | ✅  |
| POST   | `/:projectId/tasks` | JWT  |                   | ✅  |
| GET    | `/:projectId/tasks` | JWT  |                   | ✅  |
| PATCH  | `/tasks/:id`        | JWT  |                   | ✅  |

---

### `/v1/sessions`

| Method | Path                | Auth                            | Notes                                                                           | Status |
| ------ | ------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ------ |
| POST   | `/batch`            | JWT                             | Batch sync desktop sessions                                                     | ✅     |
| GET    | `/`                 | JWT                             | query: from, to, user_id?, project_id?, page, limit; overlap logic + deductions | ✅     |
| PATCH  | `/:id`              | JWT                             | notes, project_id, task_id                                                      | ✅     |
| GET    | `/pending-approval` | JWT + manager/admin/super_admin |                                                                                 | ✅     |
| POST   | `/:id/approve`      | JWT + manager/admin/super_admin | notes?; enqueues time-log-push                                                  | ✅     |
| POST   | `/:id/reject`       | JWT + manager/admin/super_admin | reason                                                                          | ✅     |
| PATCH  | `/:id/admin-edit`   | JWT + admin/super_admin         | started_at, ended_at, project_id, task_id, notes                                | ✅     |

---

### `/v1/users`

| Method | Path               | Auth                                                       | Status                                         |
| ------ | ------------------ | ---------------------------------------------------------- | ---------------------------------------------- | --- |
| GET    | `/`                | JWT + admin/manager/super_admin                            |                                                | ✅  |
| GET    | `/:id`             | JWT + self or canAccessOrgUser                             | last_active, is_tracking, org offline settings | ✅  |
| PATCH  | `/:id/permissions` | JWT + manager/admin/super_admin + OFFLINE_TIME_MANAGE_USER | can_add_offline_time                           | ✅  |
| PATCH  | `/:id/manager`     | JWT + USERS_ASSIGN_MANAGER                                 | manager_id                                     | ✅  |

---

### `/v1/dashboard`

| Method | Path            | Auth | Response                                           | Status |
| ------ | --------------- | ---- | -------------------------------------------------- | ------ |
| GET    | `/team-summary` | JWT  | Per-user aggregates, latest screenshot signed URLs | ✅     |

---

### `/v1/screenshots`

| Method | Path                 | Auth                  | Status                                  |
| ------ | -------------------- | --------------------- | --------------------------------------- | --- |
| POST   | `/upload-url`        | JWT                   | presigned PUT main + optional thumb     | ✅  |
| POST   | `/:id/thumb-presign` | JWT                   | Retry thumb PUT                         | ✅  |
| POST   | `/confirm`           | JWT                   | upload_id                               | ✅  |
| GET    | `/`                  | JWT                   | list + signed URLs                      | ✅  |
| POST   | `/:id/blur`          | JWT + MANAGERS_ACCESS | queues blur                             | ✅  |
| DELETE | `/:id`               | JWT + MANAGERS_ACCESS | soft delete + S3 delete + deduction row | ✅  |
| GET    | `/:id/file`          | JWT                   | streams object from S3                  | ✅  |

---

### `/v1/activity`

| Method | Path     | Auth | Status                                          |
| ------ | -------- | ---- | ----------------------------------------------- | --- |
| POST   | `/batch` | JWT  | upsert ActivityLog; respects org tracking flags | ✅  |

---

### `/v1/offline-time`

| Method | Path   | Auth | Status                      |
| ------ | ------ | ---- | --------------------------- | --- |
| GET    | `/`    | JWT  | query: user_id?, from?, to? | ✅  |
| POST   | `/`    | JWT  | create                      | ✅  |
| DELETE | `/:id` | JWT  |                             | ✅  |

---

### `/v1/integrations`

| Method | Path                 | Auth                    | Status                             |
| ------ | -------------------- | ----------------------- | ---------------------------------- | --- |
| GET    | `/connect/:provider` | JWT + admin/super_admin | Returns auth_url, state (PKCE)     | ✅  |
| GET    | `/callback`          | No (browser redirect)   | OAuth callback                     | ✅  |
| GET    | `/`                  | JWT + admin/super_admin | List                               | ✅  |
| GET    | `/:id`               | JWT + admin/super_admin | + stats                            | ✅  |
| DELETE | `/:id`               | JWT + admin/super_admin | Shred tokens, archive ext projects | ✅  |
| POST   | `/:id/sync`          | JWT + admin/super_admin | Enqueues integration-sync job      | ✅  |

---

### `/v1/agent` (Bearer **agent** token — `createVerifyAgentMiddleware`)

| Method | Path                | Auth        | Status                                                              |
| ------ | ------------------- | ----------- | ------------------------------------------------------------------- | --- |
| GET    | `/commands`         | Agent token | Pending commands leased with `FOR UPDATE SKIP LOCKED` → `executing` | ✅  |
| POST   | `/commands/:id/ack` | Agent token | Body: `status` success \| failed, optional `error`                  | ✅  |
| POST   | `/heartbeat`        | Agent token | Optional agentVersion, status, lastSyncAt, lastSyncCount            | ✅  |
| POST   | `/ingest/jira`      | Agent token | Body: `issues[]` upserted into `JiraIssue`                          | ✅  |
| GET    | `/config`           | Agent token | Jira sync prefs from `OrgSettings`                                  | ✅  |

---

### `/v1/reports`

| Method | Path        | Auth | Notes                                    | Status                         |
| ------ | ----------- | ---- | ---------------------------------------- | ------------------------------ |
| GET    | `/time`     | JWT  | group_by: day \| week \| project \| user | ✅ (week uses ISO week labels) |
| GET    | `/activity` | JWT  |                                          | ✅                             |
| GET    | `/export`   | JWT  | format csv \| json                       | ✅                             |

---

### `/v1/admin`

| Method | Path              | Auth                                                 | Status                                    |
| ------ | ----------------- | ---------------------------------------------------- | ----------------------------------------- | --- |
| GET    | `/users`          | JWT + admin/manager/super_admin                      |                                           |
| PATCH  | `/users/:id`      | JWT + admin/manager/super_admin                      | Cannot edit super_admin or self           |
| DELETE | `/users/:id`      | JWT + USERS_SUSPEND                                  | Suspends user                             |
| GET    | `/settings`       | JWT + admin/super_admin                              |                                           |
| PATCH  | `/settings`       | JWT + admin/super_admin                              | Includes `idle_*` via advanced permission | ✅  |
| POST   | `/agent/token`    | JWT + admin/super_admin                              | Returns plaintext token once              | ✅  |
| DELETE | `/agent/token`    | JWT + admin/super_admin                              | Revokes all org agent tokens              | ✅  |
| GET    | `/agent/status`   | JWT + admin/super_admin                              | Heartbeat + token preview                 | ✅  |
| GET    | `/agent/commands` | JWT + admin/super_admin                              | Paginated command history                 | ✅  |
| PATCH  | `/agent/config`   | JWT + admin/super_admin + `SETTINGS_MANAGE_ADVANCED` | Jira agent Json fields                    | ✅  |
| POST   | `/agent/commands` | JWT + admin/super_admin                              | Enqueue `AgentCommand`                    | ✅  |
| GET    | `/audit-log`      | JWT + admin/super_admin                              |                                           |
| GET    | `/streaks`        | JWT + admin/manager/super_admin                      |                                           |
| GET    | `/analytics`      | JWT + admin/super_admin                              |                                           |

---

### `/v1/platform` (platform admin)

| Method | Path                 | Auth                 | Status                                        |
| ------ | -------------------- | -------------------- | --------------------------------------------- | --- |
| GET    | `/orgs`              | JWT + platform admin |                                               |
| POST   | `/orgs`              | JWT + platform admin | Creates org + super admin user + verify email |
| GET    | `/orgs/:orgId/users` | JWT + platform admin |                                               |
| POST   | `/orgs/:orgId/users` | JWT + platform admin |                                               |
| GET    | `/analytics`         | JWT + platform admin | Cross-tenant counts                           | ✅  |

---

### Standard error shape (non-500)

```json
{ "code": "ERROR_CODE", "message": "Human-readable" }
```

500 responses use `code: "INTERNAL_ERROR"` generic message when handled by global handler.

---

## 6. Integrations

| Integration                   | Auth                                                                                                             | Handlers / libs                                                                                                                                       | Status                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Jira Cloud**                | OAuth 2.0 + PKCE (`JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET`); Atlassian `auth.atlassian.com` + `api.atlassian.com` | `lib/integrations/jira.ts`, connect/callback/list/delete/sync routes, `integrationSync` worker, `timeLogPush` worker (`pushTimeEntry` → Jira worklog) | ✅ **`initAdapters()`** at startup; **`getAdapter()`** → 503 `INTEGRATION_NOT_CONFIGURED` if unknown |
| **Asana**                     | OAuth 2.0 + PKCE (`ASANA_CLIENT_ID` / `ASANA_CLIENT_SECRET`)                                                     | `lib/integrations/asana.ts`; same routes/workers                                                                                                      | ✅                                                                                                   |
| **Tempo**                     | —                                                                                                                | —                                                                                                                                                     | ❌                                                                                                   |
| **Slack**                     | —                                                                                                                | —                                                                                                                                                     | ❌                                                                                                   |
| **Jira Server / Data Center** | —                                                                                                                | —                                                                                                                                                     | ❌ (Cloud API paths only)                                                                            |

**SSRF**: `lib/integrations/ssrf.js` + `SSRF_ALLOWED_HOSTS` in config.

**Token storage**: Encrypted blob in `Integration.auth_data`; KMS or `DB_ENCRYPTION_KEY` fallback (`lib/integrations/kms.ts`).

---

## 7. Agent System

| Item                                                                 | Status                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| DB: `AgentToken`, `AgentCommand`, `AgentHeartbeat`, `JiraIssue`      | ✅                                                                         |
| Agent auth                                                           | ✅ Bearer token → SHA-256 → `AgentToken`; `middleware/verifyAgentToken.ts` |
| GET `/v1/agent/commands`                                             | ✅ Transaction + `FOR UPDATE SKIP LOCKED` (PostgreSQL)                     |
| POST `/v1/agent/commands/:id/ack`                                    | ✅ Success / failed → retry or `permanently_failed` when `attempts >= 3`   |
| POST `/v1/agent/heartbeat`                                           | ✅                                                                         |
| POST `/v1/agent/ingest/jira`                                         | ✅                                                                         |
| GET `/v1/agent/config`                                               | ✅                                                                         |
| Multi-org isolation                                                  | ✅ All queries scoped by `agentOrgId` from token                           |
| Stale `executing` cleanup                                            | ✅ BullMQ `agent-maintenance` repeatable job every 5 min                   |
| Offline heartbeat detection                                          | ✅ Same queue, job every 2 min                                             |
| Admin: token CRUD, status, commands list, config PATCH, enqueue POST | ✅                                                                         |

Desktop `tracksync-agent` should call `/v1/agent/*` with the issued agent token.

---

## 8. Background Jobs & Queues

**System**: **BullMQ** + Redis.

### Queues defined (`queues/index.ts`)

| Queue name              | Getter                     | Worker?                   | Producer?                                         | Status |
| ----------------------- | -------------------------- | ------------------------- | ------------------------------------------------- | ------ |
| `email`                 | `getEmailQueue`            | ✅ emailWorker            | ✅ signup, verify, reset, invite, lib/email, etc. | ✅     |
| `screenshot-processing` | `getScreenshotQueue`       | ✅ screenshotWorker       | ✅ confirm + manual blur                          | ✅     |
| `integration-sync`      | `getIntegrationQueue`      | ✅ integrationSyncWorker  | ✅ callback + POST sync                           | ✅     |
| `time-log-push`         | `getTimeLogPushQueue`      | ✅ timeLogPushWorker      | ✅ session approve                                | ✅     |
| `budget-alert`          | `getBudgetAlertQueue`      | ✅ budgetAlertWorker      | ✅ Repeatable hourly (`scheduleRepeatableJobs`)   | ✅     |
| `retention`             | `getRetentionQueue`        | ✅ retentionWorker        | ✅ Repeatable daily 02:00 UTC                     | ✅     |
| `agent-maintenance`     | `getAgentMaintenanceQueue` | ✅ agentMaintenanceWorker | ✅ Repeatable 5 min / 2 min                       | ✅     |

`getSyncQueue` removed (was unused).

### Workers (job name / trigger)

| Worker                 | Queue                 | Trigger                                   | Behavior                                                                  | Status |
| ---------------------- | --------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | ------ |
| emailWorker            | email                 | Event: job `transactional`                | Sends verify, welcome, reset, invite, password changed, plan upgrade, raw | ✅     |
| screenshotWorker       | screenshot-processing | Event: `process-screenshot`               | Download S3, blur, re-upload, update thumb, `is_blurred`                  | ✅     |
| integrationSyncWorker  | integration-sync      | Event: `sync`                             | Decrypt tokens, refresh, fetch projects/tasks, upsert                     | ✅     |
| timeLogPushWorker      | time-log-push         | Event: `push`                             | Push worklog to Jira/Asana if adapter supports                            | ✅     |
| retentionWorker        | retention             | Repeatable `retention-sweep` daily        | Purge expired screenshots per org retention                               | ✅     |
| budgetAlertWorker      | budget-alert          | Repeatable `budget-check` hourly          | Budget emails to org admins                                               | ✅     |
| agentMaintenanceWorker | agent-maintenance     | `stale-command-cleanup` / `offline-check` | Reset stuck commands; mark agents offline                                 | ✅     |

**Scheduling**: `scheduleRepeatableJobs()` in [`queues/index.ts`](packages/backend/src/queues/index.ts) runs after `startWorkers()` from [`main.ts`](packages/backend/src/main.ts). Multiple app instances: BullMQ dedupes repeat metadata by `jobId` in Redis (verify under load).

---

## 9. Email System

| Item           | Detail                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Provider       | **Resend** (`RESEND_API_KEY`)                                                                                             |
| Sender         | Default `TrackSync <support@tracksync.dev>`; override `RESEND_FROM`                                                       |
| Architecture   | `services/email/emailService.ts` → Resend API; transactional sends **enqueued** via `enqueue.ts` → BullMQ → `emailWorker` |
| `lib/email.ts` | Enqueues `kind: 'raw'` for ad-hoc (e.g. session rejected, budget alerts)                                                  |

### Email types

| Type             | Trigger                              | Status                                 |
| ---------------- | ------------------------------------ | -------------------------------------- |
| Verify email     | Signup / platform org create         | ✅                                     |
| Welcome          | After verify-email GET               | ✅                                     |
| Password reset   | Forgot password                      | ✅                                     |
| Invite           | POST invite                          | ✅                                     |
| Password changed | After reset-password                 | ✅                                     |
| Session rejected | POST session reject                  | ✅ (raw email)                         |
| Budget alert     | budgetAlertWorker                    | ✅ (hourly repeatable job)             |
| Plan upgrade     | `sendPlanUpgradeEmail` / worker case | ❌ No production caller (TODO in code) |

---

## 10. Payment & Billing

| Topic                     | Status                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| Stripe                    | ❌ **[NOT IMPLEMENTED]** — not referenced in backend `src/`        |
| Razorpay                  | ❌                                                                 |
| Webhooks                  | ❌                                                                 |
| Currencies                | ❌                                                                 |
| Subscription / seat model | ❌ — `Organization.plan` is a string only (`trial` default)        |
| Trial fields              | ✅ DB columns exist; no automated trial expiry job found in `src/` |

---

## 11. Multi-Tenancy

| Mechanism        | Detail                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model            | **Shared database**, **org_id** on tenant tables                                                                                                                                     |
| org_id on tables | ✅ … plus AgentToken, AgentCommand, AgentHeartbeat, JiraIssue                                                                                                                        |
| Enforcement      | ✅ Request handlers overwhelmingly scope by `req.user.org_id` or platform-admin exceptions                                                                                           |
| JWT org_id       | Must match user’s org in DB for role/name display; tampering would still hit org-scoped queries with user id — **mitigated** by DB lookups; cross-org data access blocked by queries |

### Known gaps

- **`time_approval_required`**: New sessions use `pending` vs `approved` from org settings; **totals** in session list / reports / export / dashboard use **approved-only** when the flag is on. List rows still show non-approved sessions for workflow UI.
- **`mfa_required_for_*`**: ✅ Enforced on login (`MFA_SETUP_REQUIRED` if role requires MFA and user has not enabled it). `super_admin` follows `mfa_required_for_admins`.
- **Platform admin**: Cross-tenant power by design (`/v1/platform/*`)
- **Integration registry**: ✅ `initAdapters()` at boot

---

## 12. Error Handling

| Topic          | Implementation                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global handler | ✅ `main.ts` `setErrorHandler` — 500 hides details; 4xx passes message                                                                                    |
| Logging        | Dev: Fastify logger **disabled** (`logger: false`). Prod: Fastify logger info level with serializers                                                      |
| Sentry         | ✅ Optional `Sentry.init`; captures 5xx in error handler                                                                                                  |
| Metrics        | ✅ Histogram per method/route template/status                                                                                                             |
| Rate limit     | ✅ Global `@fastify/rate-limit` with Redis; **`keyGenerator`**: verified JWT → `org:{org_id}`, else `ip:{ip}`; default **500**/minute (per-org or per-IP) |

---

## 13. Environment Variables

Validated in **`config.ts`** (zod) unless noted as read-only elsewhere.

| Variable                                              | Purpose                                            | Required                                                                                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                                              | development \| production \| test                  | Optional (default development)                                                                                                                                                                                   |
| PORT                                                  | HTTP port                                          | Optional (default 3001)                                                                                                                                                                                          |
| DATABASE_URL                                          | Postgres for Prisma                                | **Required** (valid URL). `db/prisma.ts` appends `connection_limit`, `pool_timeout`, `connect_timeout`, `statement_timeout` only if **not** already present in the URL (defaults include `connection_limit=20`). |
| REDIS_URL                                             | Redis for BullMQ, rate limit, blacklist, cache     | Optional (default redis://localhost:6380)                                                                                                                                                                        |
| JWT_PRIVATE_KEY                                       | RSA PEM for signing                                | **Required in production**                                                                                                                                                                                       |
| JWT_PUBLIC_KEY                                        | RSA PEM for verify                                 | **Required in production**                                                                                                                                                                                       |
| APP_VERSION                                           | Version string                                     | Optional                                                                                                                                                                                                         |
| APP_URL                                               | Web app origin (emails, OAuth redirect validation) | Optional                                                                                                                                                                                                         |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM | Legacy SMTP config in schema                       | Optional / unused by Resend path                                                                                                                                                                                 |
| RESEND_API_KEY                                        | Transactional email                                | Optional (emails skip/fail soft in dev)                                                                                                                                                                          |
| SES_REGION                                            | Legacy / unused                                    | Optional — email uses Resend only                                                                                                                                                                                |
| AWS_REGION                                            | AWS SDK default region                             | Optional                                                                                                                                                                                                         |
| AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY              | S3/KMS credentials                                 | Optional (e.g. IAM role in AWS)                                                                                                                                                                                  |
| S3_ENDPOINT                                           | R2/custom S3 endpoint                              | Optional                                                                                                                                                                                                         |
| S3_FORCE_PATH_STYLE                                   | Path-style addressing                              | Optional                                                                                                                                                                                                         |
| S3_SCREENSHOT_BUCKET                                  | Bucket name                                        | Optional (default tracksync-screenshots)                                                                                                                                                                         |
| KMS_SCREENSHOT_KEY_ID                                 | SSE-KMS for S3 puts (non-R2)                       | Optional                                                                                                                                                                                                         |
| DATABASE_READ_URL                                     | Read replica URL                                   | Optional                                                                                                                                                                                                         |
| KMS_INTEGRATIONS_KEY_ID                               | KMS data key for integration tokens                | Optional                                                                                                                                                                                                         |
| SSRF_ALLOWED_HOSTS                                    | Comma-separated allowlist for outbound fetch       | Optional                                                                                                                                                                                                         |
| JIRA_CLIENT_ID, JIRA_CLIENT_SECRET                    | Jira OAuth                                         | Optional                                                                                                                                                                                                         |
| ASANA_CLIENT_ID, ASANA_CLIENT_SECRET                  | Asana OAuth                                        | Optional                                                                                                                                                                                                         |
| SENTRY_DSN                                            | Error tracking                                     | Optional                                                                                                                                                                                                         |

**Read in code but not in zod schema** (still required for correct prod behavior when used):

| Variable          | Purpose                                                                            | Required                                                   |
| ----------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| DB_ENCRYPTION_KEY | 64 hex chars for local AES encryption of integration/MFA secrets when KMS not used | **Required in production** per `kms.ts` when not using KMS |
| RESEND_FROM       | From header override                                                               | Optional                                                   |
| DATABASE_URL      | Also read in `db/prisma.ts` directly                                               | Duplicate read                                             |

---

## 14. What Is Missing / Not Yet Built

### Referenced but unwired / incomplete

1. **Plan upgrade email** — TODO in `services/email/emailService.ts`; no billing webhook.
2. **Payment providers** — Stripe/Razorpay not integrated.
3. **Tempo / Slack / Jira Server** — not implemented (see §6).

### TODOs in code (from grep)

- `services/email/emailService.ts`: plan upgrade email — _"Call from billing (e.g. Stripe webhook) or admin plan-change flow when implemented."_

### Frontend / external callers

- Landing uses `NEXT_PUBLIC_API_URL` pointing at this API (`packages/landing/lib/api.ts`). **Agent** desktop app should use **`/v1/agent/*`** with an org agent token from **`POST /v1/admin/agent/token`**.

---

## 15. Suggested Next Steps (priority)

1. **Run migrations** on each environment (`pnpm exec prisma migrate deploy` when `DATABASE_URL` is reachable).
2. **Validate BullMQ repeatable jobs** with multiple app replicas (dedupe / no duplicate sweeps).
3. **Product rules** — extend time-approval filtering to list UIs or keep list-all + approved-only totals (document for PMs).
4. **Billing** — wire plan upgrade email and subscription model when Stripe (or other) is added.
5. **Agent UX** — ship `tracksync-agent` against documented `/v1/agent` contract.

---

_End of TRACKSYNC_BACKEND.md_
