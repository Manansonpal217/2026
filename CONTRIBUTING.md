# Contributing

## Prerequisites

- Node.js **20+**
- **pnpm 9+**
- **Docker** (Postgres + Redis for local backend)

## Windows

- Use **native Node + pnpm** (recommended) or WSL2.
- `pnpm dev` runs [scripts/dev-all.mjs](../scripts/dev-all.mjs) (backend, landing, desktop). No bash/`lsof` required.
- After running `npm rebuild better-sqlite3-multiple-ciphers` for **Node** (e.g. to fix Vitest), run `pnpm rebuild:desktop` before `pnpm dev:desktop` so native addons match **Electron** again.

## Scripts

| Command                | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `pnpm setup`           | Docker infra + `db:push` + seed                 |
| `pnpm dev`             | Backend + landing + desktop                     |
| `pnpm test`            | Backend + desktop unit tests                    |
| `pnpm rebuild:desktop` | Rebuild `uiohook-napi` + SQLCipher for Electron |

## Docker images

```bash
docker build -f packages/backend/Dockerfile -t tracksync-backend .
docker build -f packages/landing/Dockerfile -t tracksync-landing .
```

See [RUNBOOK.md](./RUNBOOK.md) for production deploy steps.
