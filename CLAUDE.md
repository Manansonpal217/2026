# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TrackSync** — Employee time tracking with screenshots, activity monitoring, and project management integrations. Three-package pnpm monorepo:

- `packages/backend` — Fastify 5 + Prisma + Redis API (port 3001)
- `packages/landing` — Next.js 14 marketing site + `/myhome` manager dashboard + `/admin` platform admin (port 3002)
- `packages/desktop` — Electron 40 + React desktop app (time tracker client)

## Commands

### Root (run from repo root)

```bash
pnpm setup              # Docker infra + db:push + seed (first-time setup)
pnpm dev                # Start backend + landing + desktop concurrently
pnpm dev:backend        # Backend only
pnpm dev:landing        # Landing only
pnpm dev:desktop        # Desktop only
pnpm test               # Run backend + desktop tests
pnpm lint               # Lint all packages
pnpm typecheck          # Typecheck all packages
pnpm build              # Build all packages
pnpm format             # Prettier format all TS/TSX/JSON/MD
pnpm db:generate        # Regenerate Prisma client after schema changes
pnpm db:push            # Push schema to DB (dev, no migration file)
pnpm db:seed            # Seed dev data (scripts/seed.ts)
pnpm rebuild:desktop    # Rebuild uiohook-napi + SQLCipher for Electron
```

### Backend (`packages/backend`)

```bash
pnpm --filter backend dev            # tsx watch (hot reload)
pnpm --filter backend test           # Vitest run
pnpm --filter backend test:watch     # Vitest watch
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend exec prisma studio
pnpm --filter backend run generate-keys   # Generate RS256 JWT key pair for .env
```

Run a single test file:

```bash
pnpm --filter backend exec vitest run src/__tests__/settings.test.ts
```

### Landing (`packages/landing`)

```bash
pnpm --filter landing dev            # next dev -p 3002
pnpm --filter landing build
pnpm --filter landing lint
pnpm --filter landing typecheck
```

### Desktop (`packages/desktop`)

```bash
pnpm --filter desktop dev            # electron-vite dev
pnpm --filter desktop test
pnpm --filter desktop build
```

### Infrastructure

```bash
docker compose up -d    # Start PostgreSQL (port 5433) + Redis (port 6380)
docker compose down
```

## Architecture

### Backend

**Entry:** `packages/backend/src/main.ts` — boots Fastify with plugins (cors, helmet, rateLimit, compress, underPressure), registers all routes under `/v1`, connects Prisma + Redis, starts BullMQ workers.

**Route tree** (`src/routes/v1.ts`):

- `/v1/public/auth/*` — unauthenticated (signup, verify-email, password-reset, invite accept)
- `/v1/app/auth/*` — login, refresh, logout, me, MFA
- `/v1/app/*` — authenticated user routes (settings, notifications, dashboard, offline-time)
- `/v1/projects/`, `/v1/sessions/`, `/v1/users/`, `/v1/teams/`, `/v1/screenshots/`, `/v1/activity/`, `/v1/integrations/`, `/v1/reports/` — feature routes
- `/v1/admin/*` — org-scoped admin (OWNER/ADMIN/MANAGER roles)
- `/v1/agent/*` — desktop agent API (Bearer token auth via `AgentToken` table)
- `/v1/platform/*` — cross-tenant platform admin (requires `is_platform_admin` + MFA)

**Auth flow:**

1. `POST /v1/app/auth/login` → issues 15-min RS256 access token + refresh token
2. If MFA required → returns `mfa_pending` scoped token (5-min), must call `/v1/app/auth/mfa/verify`
3. `authenticate` middleware (`src/middleware/authenticate.ts`) — verifies JWT, checks JTI blacklist in Redis, caches user status for 60s, enforces `role_version` to force re-login on role changes
4. Helper guards: `requireRole(...roles)`, `requirePermission(...perms)`, `requirePlatformAdmin()`, `requirePlatformAdminOrOrgOwner()`

**Database:** PostgreSQL via Prisma 5 (`packages/backend/prisma/schema.prisma`). Key models:

- `Organization` → `User` → `TimeSession` → `Screenshot` / `ActivityLog`
- `OrgSettings` — per-org feature flags (screenshot interval, blur, idle detection, approval workflows)
- `AgentToken` + `AgentCommand` + `AgentHeartbeat` — desktop agent coordination
- `OfflineTime` — leave/offline requests with PENDING/APPROVED/REJECTED/EXPIRED workflow
- `Streak`, `Notification`, `AuditLog`, `Team`/`TeamMember`, `JiraIssue`

**Queues:** BullMQ with Redis (`src/queues/`). Workers include `pdfExportWorker`, `reportEmailWorker`, `agentMaintenanceWorker`.

**Env vars:** See `packages/backend/.env.example`. JWT keys generated via `pnpm --filter backend run generate-keys`. Production requires persistent RS256 key pair.

### Landing (Next.js)

**Route groups:**

- `app/(marketing)/` — public pages (login, marketing site)
- `app/(dashboard)/myhome/` — authenticated manager/employee dashboard
  - `[userId]/` — individual user view
  - `dashboard/` — team dashboard
  - `organization/` — org settings, users, audit, billing
  - `offline-time/`, `reports/`, `team/`
- `app/admin/` — platform superadmin (`/admin`)
- `app/api/auth/` — NextAuth handlers

Auth uses NextAuth v4 (`next-auth`) calling the backend `/v1/app/auth/login`. Backend session data is stored in NextAuth JWT. `SessionRoot` component wraps the app for client-side session access.

State management: Zustand stores (`packages/landing/stores/`). Custom hooks in `packages/landing/hooks/`.

### Desktop (Electron)

Main process at `packages/desktop/src/main/index.ts`. Uses `better-sqlite3-multiple-ciphers` for encrypted local SQLite DB, `uiohook-napi` for global keyboard/mouse hooks (activity tracking), `screenshot-desktop` + `sharp` for screenshots. Communicates with backend via REST API using `AgentToken` for machine-level auth. Auto-update via `electron-updater`.

After any `npm rebuild` or Node version change, run `pnpm rebuild:desktop` to recompile native modules for Electron.

## Key Conventions

**User roles:** `OWNER > ADMIN > MANAGER > EMPLOYEE > VIEWER`. Permissions defined in `src/lib/permissions.ts`.

**Multi-tenancy:** Every model has `org_id`. Queries must always filter by `org_id` from `request.user.org_id` — never trust client-supplied org IDs for scoping.

**Prisma migrations:** Use `prisma migrate dev` for new migrations (creates files under `packages/backend/prisma/migrations/`). Use `db:push` only in dev for quick iteration. Migration files are committed.

**Testing:** Vitest in `src/__tests__/`. Backend tests are unit/integration style. No mocking of Prisma/Redis in integration tests — use real DB via Docker.

**ESM:** Backend uses `"type": "module"` — all imports need `.js` extension even for `.ts` files.
