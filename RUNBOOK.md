# TrackSync production runbook

## Phase 1 — small deployment (~100 users)

1. **Postgres + Redis** — Managed (e.g. DigitalOcean) or `docker compose` for Postgres/Redis only.
2. **Backend** — Build and run the API container ([packages/backend/Dockerfile](./packages/backend/Dockerfile)).
   - Set `DATABASE_URL` with `?connection_limit=10` on the primary.
   - Set `REDIS_URL`, `NODE_ENV=production`, `APP_URL` to your landing HTTPS origin.
   - **Required:** `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (PEM), `DB_ENCRYPTION_KEY` (64-char hex unless using AWS KMS for integrations).
   - Run migrations before or on deploy: `pnpm --filter backend exec prisma migrate deploy` (from CI or a job container).
3. **Landing** — Recommend Vercel or the [packages/landing/Dockerfile](./packages/landing/Dockerfile).
   - **Required:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`.
4. **Screenshots / object storage** — Cloudflare R2 (S3-compatible): set `S3_ENDPOINT`, `AWS_REGION=auto`, keys, `S3_SCREENSHOT_BUCKET`, `S3_FORCE_PATH_STYLE=true` on the backend. Put a **custom domain + CDN** (Cloudflare) in front of the public bucket hostname for cheaper egress than AWS-only CloudFront.
5. **Desktop updates** — Build with `AUTO_UPDATE_BASE_URL` pointing at a public directory that holds `latest.yml` and artifacts from `electron-builder` (generic provider). Optional: `SENTRY_DSN` baked at build time (see `electron.vite.config.ts`).
6. **Health checks** — Uptime monitor on `GET /health/ready` (returns 503 if DB or Redis down). Liveness: `GET /health/live`.
7. **Logs / errors** — Production uses **Pino** JSON logs to stdout; ship to Better Stack / Datadog / CloudWatch. Optional `SENTRY_DSN` on the backend.
8. **Metrics** — `GET /metrics` (Prometheus format) for Grafana or a hosted scraper.

## Phase 2 — load balancer + read replica

- Add a load balancer in front of API instances.
- Create a Postgres read replica; set `DATABASE_READ_URL` (no code change; see `db-read.ts`).
- Raise `connection_limit` in `DATABASE_URL` or introduce **PgBouncer** (transaction pooling) when many API processes connect to one primary.

### PgBouncer (sketch)

Run PgBouncer between apps and Postgres, `pool_mode = transaction`, point `DATABASE_URL` at PgBouncer. Keep migrations using a direct URL to the primary. Typical DigitalOcean/Managed DB offerings include connection pooling — prefer the provider’s pool before self-hosting.

## Phase 3+ — workers, Redis HA, Kubernetes

- **Workers:** Run BullMQ workers in separate processes/containers from the HTTP API when screenshot CPU dominates.
- **Redis:** Move from single instance to HA (Sentinel or managed) before user scale breaks auth/rate limits/queues.
- **Kubernetes / DOKS:** Optional at high scale — deploy the same Docker images; use Deployments + HPA; migrate with `prisma migrate deploy` as an init job.

## Rollback

1. Revert to previous container image tag.
2. If a migration was applied, restore DB from backup or run a down migration if you maintain one (Prisma has no automatic down — plan restores).

## Secrets

Store production secrets in your host’s secret manager (GitHub Environments, Doppler, DigitalOcean App secrets, AWS Secrets Manager). The app only reads environment variables; no AWS SDK is required for loading secrets at runtime.
