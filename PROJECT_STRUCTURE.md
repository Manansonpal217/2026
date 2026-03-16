# TrackSync — Project Structure

> Monorepo layout for backend, desktop app, and web admin panel.

## Overview

```
tracksync/
├── docs/                    # Documentation (phases, modules, architecture)
├── packages/
│   ├── backend/             # Node.js + Fastify API
│   ├── desktop/             # Electron + React desktop app
│   └── web/                 # Next.js admin panel
├── .github/workflows/       # CI and release pipelines
├── docker-compose.yml       # PostgreSQL + Redis (local dev)
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

## Web (`packages/web`)

```
web/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Landing
│   ├── providers.tsx         # SessionProvider, QueryClient
│   ├── globals.css
│   ├── (auth)/               # Route group — auth layout
│   │   ├── layout.tsx
│   │   └── auth/
│   │       └── login/
│   │           └── page.tsx   # /auth/login
│   ├── (dashboard)/          # Route group — dashboard layout
│   │   ├── layout.tsx
│   │   └── admin/
│   │       └── dashboard/
│   │           └── page.tsx   # /admin/dashboard
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts
├── components/
│   └── ui/
├── lib/
│   ├── api.ts
│   ├── auth.ts               # NextAuth config
│   └── utils.ts
├── types/
│   └── next-auth.d.ts
├── middleware.ts             # Protected routes
├── next.config.js
└── package.json
```

---

## Documentation (`docs/`)

```
docs/
├── README.md                 # Docs index
├── INDEX.md                  # Module index
├── main.md                   # Product plan
├── DEVELOPMENT_PLAN.md       # Phase 0–9 plan
├── PHASE_EXECUTION_PLAN.md
├── app/                      # Desktop app modules (01–13)
├── backend/                  # Backend API modules (01–18)
├── admin-panel/              # Web admin modules (00–11)
└── phases/                   # Phase implementation guides
    ├── phase-00-setup.md
    ├── phase-01-auth.md
    └── ...
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all packages in parallel |
| `pnpm dev:backend` | Backend only (port 3001) |
| `pnpm dev:desktop` | Electron app |
| `pnpm dev:web` | Next.js (port 3000) |
| `pnpm build` | Build all packages |
| `pnpm db:push` | Prisma db push |
| `pnpm db:seed` | Seed demo org + user |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript check |
