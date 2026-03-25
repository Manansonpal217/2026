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

3. **Setup database and seed demo data**

   ```bash
   pnpm setup
   ```

   Or manually: `pnpm db:push && pnpm db:seed`

4. **Run all services**

   ```bash
   pnpm dev:all
   ```

   Or: `pnpm dev` (backend + landing + desktop in parallel)

   Or run individually:
   - Backend: `pnpm dev:backend` (http://localhost:3001)
   - Desktop: `pnpm dev:desktop` (Electron app)
   - Landing: `pnpm dev:landing` (http://localhost:3002)

### Test Credentials (after seed)

| App               | Email          | Password | Org  |
| ----------------- | -------------- | -------- | ---- |
| Desktop           | admin@demo.com | demo1234 | demo |
| Landing / My Home | admin@demo.com | demo1234 | demo |

**If you see "No projects yet" in the desktop app:** Sign out, then sign back in with the credentials above. The Organization field must be `demo` to see the seeded projects.

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
  web/       # Next.js Admin Panel
```
