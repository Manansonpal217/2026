# Dummy credentials (local dev)

These match what `scripts/seed-dev.ts` creates. **Do not use in production.**

Re-seed (wipes DB and recreates data):

```bash
pnpm --filter backend exec tsx scripts/seed-dev.ts
```

## Platform super admin (also Acme Corp OWNER)

| Field    | Value             |
| -------- | ----------------- |
| Email    | `manan@admin.com` |
| Password | `manan`           |

- After login, platform admins are sent to `/admin/dashboard`.
- Same user has full access to `/myhome` as **Acme Corp** (OWNER).

## Acme Corp (password `pass1234`)

| Email            | Role     |
| ---------------- | -------- |
| `sarah@acme.com` | Admin    |
| `john@acme.com`  | Manager  |
| `alice@acme.com` | Employee |
| `bob@acme.com`   | Employee |
| `eve@acme.com`   | Employee |

## Other organizations (password `pass1234`)

| Email                     | Org           | Plan         |
| ------------------------- | ------------- | ------------ |
| `founder@startup-xyz.com` | Startup XYZ   | TRIAL        |
| `cto@enterprise-co.com`   | Enterprise Co | PROFESSIONAL |

## Orgs in seed

- **Acme Corp** (`acme`) — STANDARD
- **Startup XYZ** (`startup-xyz`) — TRIAL
- **Enterprise Co** (`enterprise-co`) — PROFESSIONAL

## Sample data

Roughly: 30 days of time sessions, streaks, offline time (pending/approved/rejected), notifications, audit log entries, and a few per-user settings overrides.
