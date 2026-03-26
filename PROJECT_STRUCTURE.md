# TrackSync — Project Structure

> Monorepo layout for backend, desktop app, and web admin panel.

## Overview

```
tracksync/
├── docs/                    # Documentation (e.g. DEVELOPMENT_PLAN, SCALING)
├── packages/
│   ├── backend/             # Node.js + Fastify API
│   ├── desktop/             # Electron + React desktop app
│   └── landing/             # Next.js marketing + /myhome + /admin (port 3002)
├── .github/workflows/       # CI, release, optional Docker deploy
├── docker-compose.yml       # PostgreSQL + Redis + optional backend API
├── scripts/                 # dev-all.mjs (cross-platform dev orchestration)
├── RUNBOOK.md               # Production operations
├── CONTRIBUTING.md          # Local dev (incl. Windows)
├── pnpm-workspace.yaml
└── package.json             # Root scripts
```

---

## Backend (`packages/backend`)

```
backend/
├── src/
│   ├── main.ts              # Fastify entry point
│   ├── config.ts            # Env validation (zod)
│   ├── db/                   # Data layer
│   │   ├── prisma.ts         # Prisma client
│   │   ├── redis.ts          # Redis + JWT blacklist
│   │   └── index.ts
│   ├── lib/                  # Utilities
│   │   ├── jwt.ts            # RS256 JWT issue/verify
│   │   ├── password.ts       # bcrypt hash/compare
│   │   └── index.ts
│   ├── middleware/           # Auth, RBAC
│   │   ├── authenticate.ts
│   │   └── index.ts
│   ├── queues/               # BullMQ (email, sync)
│   │   └── index.ts
│   └── routes/
│       ├── v1.ts             # /v1/* router
│       └── auth/             # Auth endpoints
│           ├── index.ts
│           ├── login.ts
│           ├── refresh.ts
│           ├── logout.ts
│           ├── me.ts
│           └── signup.ts
├── prisma/
│   └── schema.prisma
├── scripts/
│   ├── seed.ts
│   └── generate-keys.ts
├── .env.example
└── package.json
```

---

## Desktop (`packages/desktop`)

```
desktop/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # App entry, window creation
│   │   ├── auth/             # Auth IPC handlers
│   │   │   ├── handlers.ts   # auth:login, logout, get-current-user
│   │   │   └── keychain.ts   # keytar token storage
│   │   └── db/               # Local SQLite (Phase 2+)
│   │       └── index.ts
│   ├── preload/              # Context bridge
│   │   └── index.ts
│   └── renderer/             # React UI
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.html
│       ├── env.d.ts
│       └── pages/
│           └── Login.tsx
├── electron.vite.config.ts
├── electron-builder.yml
├── .env.example
└── package.json
```

---

## Landing (`packages/landing`)

Next.js 14 App Router: marketing pages (`(marketing)`), authenticated `/myhome` (`(dashboard)`), platform `/admin`, NextAuth API route, middleware for protected paths. Dev server default port **3002**. Production: `output: 'standalone'`; see `Dockerfile` in this package.

---

## Documentation (`docs/`)

Primary file today: [docs/DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md). See also [docs/SCALING.md](./docs/SCALING.md).

---

## Scripts

| Command            | Description                  |
| ------------------ | ---------------------------- |
| `pnpm dev`         | Run all packages in parallel |
| `pnpm dev:backend` | Backend only (port 3001)     |
| `pnpm dev:desktop` | Electron app                 |
| `pnpm dev:landing` | Next.js landing (port 3002)  |
| `pnpm build`       | Build all packages           |
| `pnpm db:push`     | Prisma db push               |
| `pnpm db:seed`     | Seed demo org + user         |
| `pnpm lint`        | Lint all packages            |
| `pnpm typecheck`   | TypeScript check             |
