# Phase 0 — Project Setup & DevOps (Week 1–2)

## Goal

Every developer on the team can clone the repository, run all three services locally with a single command (`pnpm dev`), and submit a pull request that passes automated CI checks — all within 30 minutes of cloning. Infrastructure skeletons are provisioned in AWS so Phase 1 can deploy to staging immediately.

---

## Prerequisites

None. This is the foundation phase.

---

## Key Packages to Install

### Backend (`packages/backend`)

```bash
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit
pnpm add @prisma/client prisma
pnpm add redis ioredis bullmq
pnpm add -D typescript tsx @types/node eslint prettier
```

### Desktop App (`packages/desktop`)

```bash
pnpm add electron electron-vite
pnpm add better-sqlite3 keytar
pnpm add react react-dom zustand
pnpm add -D @types/better-sqlite3 electron-builder typescript vite
```

### Web Admin Panel (`packages/web`)

```bash
pnpm add next react react-dom next-auth
pnpm add @tanstack/react-query axios
pnpm add tailwindcss postcss autoprefixer
pnpm dlx shadcn-ui@latest init
pnpm add -D typescript @types/react @types/node
```

### Root workspace

```bash
# pnpm-workspace.yaml at repo root
packages:
  - 'packages/*'

# Install all at once
pnpm install
```

---

## Monorepo Structure to Create

```
tracksync/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── main.ts            ← Fastify app entry point
│   │   │   ├── routes/            ← Route handlers
│   │   │   ├── middleware/        ← Auth, rate limit middleware
│   │   │   ├── db/                ← Prisma client + helpers
│   │   │   ├── queues/            ← BullMQ queue definitions
│   │   │   └── config.ts          ← Config loaded from env
│   │   ├── prisma/
│   │   │   └── schema.prisma      ← Empty schema to start
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── main/              ← Electron main process
│   │   │   │   ├── index.ts       ← App entry, BrowserWindow setup
│   │   │   │   ├── preload.ts     ← Context bridge (IPC exposure)
│   │   │   │   └── db/            ← better-sqlite3 + keytar
│   │   │   └── renderer/          ← React app
│   │   │       ├── App.tsx
│   │   │       └── main.tsx
│   │   ├── electron-builder.yml
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── web/
│       ├── app/                   ← Next.js App Router
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components/
│       ├── lib/
│       ├── next.config.js         ← Security headers set here
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml                 ← Lint + type-check + test on every PR
│       └── release.yml            ← electron-builder on version tag
├── docker-compose.yml             ← PostgreSQL 15 + Redis
├── pnpm-workspace.yaml
└── package.json                   ← Root with dev script
```

---

## Files to Create

| File                                    | Purpose                               |
| --------------------------------------- | ------------------------------------- |
| `packages/backend/src/main.ts`          | Fastify server boot                   |
| `packages/backend/src/config.ts`        | Env var validation with `zod`         |
| `packages/backend/prisma/schema.prisma` | Empty schema (datasource + generator) |
| `packages/desktop/src/main/index.ts`    | Electron main, creates BrowserWindow  |
| `packages/desktop/src/main/preload.ts`  | Exposes `window.electron.ipcRenderer` |
| `packages/desktop/src/main/db/index.ts` | Opens SQLite, sets PRAGMAs            |
| `packages/desktop/src/main/db/key.ts`   | `getDbEncryptionKey()` via keytar     |
| `packages/web/app/layout.tsx`           | Root layout with Providers            |
| `packages/web/next.config.js`           | Security headers                      |
| `docker-compose.yml`                    | PostgreSQL 15 + Redis                 |
| `.github/workflows/ci.yml`              | CI pipeline                           |
| `.github/workflows/release.yml`         | Release pipeline                      |
| `electron-builder.yml`                  | Build config for all platforms        |

---

## Backend Tasks

- [ ] **Fastify scaffold**
  - Create `src/main.ts` — register `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`
  - Health check: `GET /health` → `{ status: 'ok', version: process.env.APP_VERSION }`
  - `src/config.ts` — parse all env vars with `zod`, throw on missing required values

- [ ] **Prisma setup**
  - `prisma/schema.prisma` with `datasource db { provider = "postgresql" }` + `generator client`
  - Run `pnpm prisma generate` — confirm Prisma Client generates without error
  - Run `pnpm prisma db push` against local Docker PostgreSQL — confirms connection works

- [ ] **Redis connection**
  - `src/db/redis.ts` — `new Redis(config.REDIS_URL)` with error handler
  - Test: `redis.ping()` on startup, log `"Redis connected"` or throw

- [ ] **BullMQ skeleton**
  - `src/queues/index.ts` — define `emailQueue`, `syncQueue` (no workers yet — just queue definitions)

- [ ] **Docker Compose**

  ```yaml
  services:
    postgres:
      image: postgres:15
      environment:
        POSTGRES_DB: tracksync_dev
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
      ports: ['5433:5432']
    redis:
      image: redis:7-alpine
      ports: ['6380:6379']
  ```

- [ ] **ESLint + Prettier**
  - `eslint.config.mjs` at repo root with `@typescript-eslint/recommended` + `prettier`
  - `prettier.config.js` — `{ semi: false, singleQuote: true, printWidth: 100 }`
  - Husky: `pnpm dlx husky init` → `.husky/pre-commit` runs `pnpm lint-staged`

---

## Desktop App Tasks

- [ ] **Electron scaffold**
  - `electron-vite` template: `pnpm create @quick-start/electron tracksync-desktop`
  - Main window: `BrowserWindow` with `webPreferences: { contextIsolation: true, preload: ... }`
  - Dev: `pnpm dev` opens Electron with Vite HMR in renderer

- [ ] **Context bridge (secure IPC)**

  ```typescript
  // src/main/preload.ts
  import { contextBridge, ipcRenderer } from 'electron'
  contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
      on: (channel: string, listener: Function) => ipcRenderer.on(channel, listener),
      off: (channel: string, listener: Function) => ipcRenderer.off(channel, listener),
    },
  })
  ```

- [ ] **SQLite smoke test**
  - `src/main/db/index.ts` — open in-memory DB with `better-sqlite3`, confirm it opens
  - `src/main/db/key.ts` — `getDbEncryptionKey()` via `keytar` with fallback for dev (env var)

- [ ] **electron-builder.yml**
  - Configure `appId: io.tracksync.app`, mac/win/linux targets
  - `publish` pointing to S3 bucket (placeholder for now)

---

## Web Admin Panel Tasks

- [ ] **Next.js scaffold**
  - App Router (`app/`) with root `layout.tsx` + `page.tsx`
  - `next.config.js` security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy)

- [ ] **shadcn/ui init**
  - Run `pnpm dlx shadcn-ui@latest init` — choose slate theme, CSS variables
  - Install base components: `button`, `input`, `card`, `table`, `dialog`, `toast`

- [ ] **React Query setup**

  ```typescript
  // app/providers.tsx
  'use client'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  const queryClient = new QueryClient()
  export function Providers({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  ```

- [ ] **Axios instance**
  ```typescript
  // lib/api.ts
  import axios from 'axios'
  export const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL })
  ```

---

## DevOps / CI Tasks

- [ ] **GitHub Actions — CI** (`.github/workflows/ci.yml`)

  ```yaml
  on: [pull_request]
  jobs:
    ci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
        - run: pnpm install --frozen-lockfile
        - run: pnpm lint
        - run: pnpm typecheck
        - run: pnpm test
  ```

- [ ] **GitHub Actions — Release** (`.github/workflows/release.yml`)
  - Triggered on `push` to tags `v*`
  - Matrix: `macos-13`, `windows-latest`, `ubuntu-22.04`
  - `npx electron-builder --publish always` with platform-specific signing secrets

- [ ] **AWS bootstrap**
  - S3 bucket: `tracksync-screenshots-staging` (private, versioning on)
  - KMS key: `tracksync/staging/master` + `tracksync/staging/screenshots`
  - IAM role: `tracksync-ecs-task-role` with Secrets Manager + KMS + S3 permissions
  - Secrets Manager entries: create placeholders for `tracksync/staging/database-url`, `tracksync/staging/stripe-secret-key`, `tracksync/staging/jwt-private-key`

- [ ] **Staging environment**
  - ECS Fargate cluster: 1 task, `t3.micro`-equivalent
  - RDS PostgreSQL 15: `db.t3.micro`, single-AZ for staging
  - ElastiCache Redis: `cache.t3.micro`
  - GitHub secret `STAGING_DEPLOY_ROLE_ARN` set

---

## Definition of Done

1. `pnpm dev` at repo root starts backend on `:3001`, Electron window opens, Next.js runs on `:3000`
2. `GET http://localhost:3001/health` returns `{ status: 'ok' }`
3. Electron window renders "TrackSync" placeholder text
4. `pnpm lint && pnpm typecheck` pass with zero errors
5. Opening a PR on GitHub triggers CI workflow — all steps pass
6. RDS + Redis are reachable from local via `docker-compose up`
7. Prisma connects: `pnpm prisma db push` runs without error

---

## Testing Checklist

| Test                             | Type        | How                                |
| -------------------------------- | ----------- | ---------------------------------- |
| Health endpoint returns 200      | Integration | `curl localhost:3001/health`       |
| Prisma connects to PostgreSQL    | Integration | `prisma db push` succeeds          |
| Redis connects                   | Integration | `redis.ping()` on startup          |
| ESLint passes with no errors     | Lint        | `pnpm lint`                        |
| TypeScript compiles all packages | Type check  | `pnpm typecheck`                   |
| Electron main window opens       | Manual      | `pnpm dev` in desktop package      |
| CI workflow passes on a blank PR | E2E CI      | Create draft PR, check Actions tab |
