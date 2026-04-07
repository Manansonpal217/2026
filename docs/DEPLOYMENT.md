# Staging and production deployment

TrackSync runs as isolated **staging** (pre-production testing) and **production** stacks. Do not share databases, Redis, JWT keys, NextAuth secrets, or S3 buckets between them.

## 1. Provisioning checklist (per environment)

Complete these for **staging** and again for **production** on your host or cloud provider.

| Resource           | Notes                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL**     | Dedicated database; set `DATABASE_URL` with TLS in production (`?sslmode=require` or provider equivalent).     |
| **Redis**          | Dedicated instance; set `REDIS_URL`.                                                                           |
| **Object storage** | Separate S3 or R2 bucket (or isolated prefix with strict IAM).                                                 |
| **DNS + TLS**      | API and landing hostnames with valid certificates (e.g. `api-staging.example.com`, `app-staging.example.com`). |
| **Secrets**        | Generate environment-specific JWT keys and `NEXTAUTH_SECRET` (see below).                                      |

### Generate backend JWT keys

From the repo root:

```bash
pnpm --filter backend run generate-keys
```

Copy the output into the target environment’s backend configuration (never commit real keys). Production requires `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` when `NODE_ENV=production`.

### Generate NextAuth secret (landing)

Use a long random string (e.g. `openssl rand -base64 32`) and set `NEXTAUTH_SECRET` in the landing environment only.

## 2. Environment variables

Templates live next to each package’s existing `.env.example`:

| Package           | Staging template                                                                  | Production template                                                                     |
| ----------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Backend           | [packages/backend/.env.staging.example](../packages/backend/.env.staging.example) | [packages/backend/.env.production.example](../packages/backend/.env.production.example) |
| Landing           | [packages/landing/.env.staging.example](../packages/landing/.env.staging.example) | [packages/landing/.env.production.example](../packages/landing/.env.production.example) |
| Desktop (CI bake) | [packages/desktop/.env.staging.example](../packages/desktop/.env.staging.example) | [packages/desktop/.env.production.example](../packages/desktop/.env.production.example) |

**Consistency rules**

- Backend `APP_URL` must equal the browser origin of the landing app for that environment (password reset, invites).
- Landing `NEXT_PUBLIC_API_URL` and `NEXTAUTH_API_URL` must point at that environment’s API.
- Landing `NEXTAUTH_URL` must match the exact landing origin (scheme + host + port).

## 3. Container images and CI/CD

The [Deploy workflow](../.github/workflows/deploy.yml) builds and pushes images to GHCR:

- **Automatic:** push to `main` builds and tags **staging** (`:staging`, `:staging-<sha>`).
- **Manual:** workflow dispatch chooses **staging** or **production**; production should use GitHub Environment protection (required reviewers).

Image tags:

- `ghcr.io/<owner>/tracksync-backend:staging` and `:staging-<git-sha>`
- `ghcr.io/<owner>/tracksync-backend:production` and `:production-<git-sha>`
- Same pattern for `tracksync-landing`.

Configure GitHub **Environments** named `staging` and `production` with separate variables and secrets for deploy hooks if you pull images to servers from CI.

## 4. Database migrations

Backend containers run `prisma migrate deploy` on startup **before** the API listens (see [docker-entrypoint.sh](../packages/backend/docker-entrypoint.sh)). To skip (e.g. external migration job), set `SKIP_PRISMA_MIGRATE=1`.

Deploy order when not using the entrypoint: run migrations against the target database, then start the backend, then ensure landing is updated.

### Rollback

Redeploy a known-good image digest (`:staging-<sha>` or `:production-<sha>`). Avoid running new migrations backward; restore from backup if needed.

## 5. Desktop builds (channels)

- **Tag push `v*`** ([release.yml](../.github/workflows/release.yml)): builds for **production** using the `production` GitHub Environment variables.
- **Manual** “Desktop (staging)” workflow: builds with the **staging** environment variables for internal testers.

Set in each GitHub Environment: `VITE_API_URL`, `VITE_LANDING_URL`, `AUTO_UPDATE_BASE_URL` (separate update feed URL per channel), optional `SENTRY_DSN`.

## 6. Production operations

| Area           | Recommendation                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backups**    | Automated PostgreSQL backups (point-in-time or daily snapshots); test restores periodically.                                                          |
| **Monitoring** | Optional `SENTRY_DSN` on backend ([.env.example](../packages/backend/.env.example)); separate DSNs per environment.                                   |
| **Access**     | Limit production DB and admin accounts; platform admin (`is_platform_admin`) only for trusted operators.                                              |
| **Email**      | Use Resend (or SMTP) with a verified domain for production; keep staging on a separate sender or allowlist to avoid emailing real users from staging. |

## 7. Local development

[docker-compose.yml](../docker-compose.yml) remains for local dev only. Staging and production run on separate infrastructure with the templates above.
