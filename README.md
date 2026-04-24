# TrackSync

Employee time tracking with screenshots, activity monitoring, and project management integrations.

- **Backend:** Fastify + Prisma + Redis
- **Desktop:** Electron + React
- **Landing:** Next.js marketing site + `/myhome` manager dashboard (port 3002)

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for the full layout. See [docs/](./docs/) for architecture and phase plans.

## Phase 1 — Auth + Org Foundation

This phase delivers end-to-end login across backend, desktop app, and web admin panel.

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL + Redis)

### Quick Start

1. **Start infrastructure**

   ```bash
   docker compose up -d
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Setup database schema**

   ```bash
   pnpm setup
   ```

   Or manually: `pnpm db:push`

4. **Run all services**

   ```bash
   pnpm dev:all
   ```

   Or: `pnpm dev` (backend + landing + desktop in parallel)

   Or run individually:
   - Backend: `pnpm dev:backend` (http://localhost:3001)
   - Desktop: `pnpm dev:desktop` (Electron app)
   - Landing: `pnpm dev:landing` (http://localhost:3002)

Create an organization and admin via **Sign up** on the landing app (`POST /v1/public/auth/signup`) or the platform admin UI, then sign in on desktop or web with that email, password, and org slug.

### API Endpoints

| Method | Endpoint                 | Description                        |
| ------ | ------------------------ | ---------------------------------- |
| POST   | `/v1/public/auth/signup` | Create org + admin user            |
| POST   | `/v1/app/auth/login`     | Email/password login               |
| POST   | `/v1/app/auth/refresh`   | Refresh access token               |
| POST   | `/v1/app/auth/logout`    | Invalidate session                 |
| GET    | `/v1/app/auth/me`        | Current user + org (auth required) |

### Project Structure

```
packages/
  backend/   # Fastify + Prisma + Redis
  desktop/   # Electron + React
  landing/   # Next.js marketing + /myhome + /admin (port 3002)
```

Production notes: [RUNBOOK.md](./RUNBOOK.md) · **Manual cloud setup (step-by-step):** [docs/MANUAL_PRODUCTION_SETUP.md](./docs/MANUAL_PRODUCTION_SETUP.md) · Local dev: [CONTRIBUTING.md](./CONTRIBUTING.md)
