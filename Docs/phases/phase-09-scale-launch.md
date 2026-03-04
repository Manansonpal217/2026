# Phase 9 — Scale, Observability & Public Launch (Week 28–32)

## Goal

TrackSync is production-ready and publicly available. The infrastructure handles 500+ concurrent organisations. OpenTelemetry distributed tracing, Datadog APM, and Sentry error tracking give full visibility into the system. Additional integrations (Google Sheets, Trello) are live. The disaster recovery plan has been tested. A public marketing site and changelog are live.

---

## Prerequisites

- Phase 0–8 complete and running stably with beta customers
- Datadog account + API key
- Sentry projects created for `backend`, `desktop`, `web`
- Production AWS account separated from staging
- Legal: Privacy Policy, Terms of Service, and DPA pages live on the marketing site

---

## Key Packages to Install

### Backend
```bash
pnpm add @opentelemetry/sdk-node
pnpm add @opentelemetry/auto-instrumentations-node
pnpm add @opentelemetry/exporter-trace-otlp-http
pnpm add @sentry/node @sentry/profiling-node
pnpm add dd-trace                # Datadog APM
```

### Desktop
```bash
pnpm add @sentry/electron        # Sentry for Electron
```

### Web
```bash
pnpm add @sentry/nextjs          # Sentry for Next.js
```

---

## Database Migrations

No new schema migrations required for this phase. This phase focuses on infrastructure, observability, and additional integrations using the existing `Integration` + adapter pattern.

---

## Files to Create

| File | Description |
|------|------------|
| `src/lib/telemetry.ts` | OpenTelemetry setup (init before all imports) |
| `src/lib/logger.ts` | Structured JSON logger with correlation ID |
| `src/middleware/correlationId.ts` | Inject `X-Correlation-ID` on every request |
| `src/lib/integrations/googleSheets.ts` | Google Sheets adapter |
| `src/lib/integrations/trello.ts` | Trello adapter |
| `src/queues/workers/healthCheck.ts` | BullMQ: periodic self-health check |
| `infrastructure/terraform/` | Terraform modules for production AWS |
| `infrastructure/terraform/rds.tf` | Multi-AZ RDS + Read Replica |
| `infrastructure/terraform/redis.tf` | Redis Cluster mode |
| `infrastructure/terraform/ecs.tf` | ECS Fargate service + autoscaling |
| `infrastructure/terraform/alb.tf` | ALB + HTTPS listener |
| `infrastructure/terraform/s3.tf` | Screenshots + releases buckets |
| `infrastructure/terraform/kms.tf` | KMS keys |
| `docs/RUNBOOK.md` | On-call runbook for common incidents |

---

## Backend Tasks

### OpenTelemetry Setup (`src/lib/telemetry.ts`)

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  serviceName: 'tracksync-backend',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY }
  }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
  })]
})
sdk.start()
```

- [ ] Call `sdk.start()` before any other imports in `src/main.ts`
- [ ] `sdk.shutdown()` gracefully on `SIGTERM`

### Correlation ID Middleware (`src/middleware/correlationId.ts`)

```typescript
fastify.addHook('onRequest', (req, reply, done) => {
  const id = req.headers['x-correlation-id'] as string || randomUUID()
  req.correlationId = id
  reply.header('X-Correlation-ID', id)
  done()
})
```

- [ ] Include `correlationId` in all structured log lines
- [ ] Desktop and Web clients send `X-Correlation-ID` in every request for end-to-end tracing

### Structured Logger (`src/lib/logger.ts`)

```typescript
import pino from 'pino'
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'tracksync-backend', env: process.env.NODE_ENV }
})
// Usage: logger.info({ correlationId, userId, orgId }, 'Session synced')
```

### Sentry Setup (Backend)

```typescript
import * as Sentry from '@sentry/node'
Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
})
fastify.setErrorHandler((error, request, reply) => {
  Sentry.captureException(error, { extra: { correlationId: request.correlationId } })
  reply.code(500).send({ error: 'Internal Server Error', correlationId: request.correlationId })
})
```

### Google Sheets Integration (`src/lib/integrations/googleSheets.ts`)

- [ ] OAuth: Google OAuth 2.0 (`https://accounts.google.com/o/oauth2/v2/auth`) with `spreadsheets.readonly` scope
- [ ] `fetchProjects` → reads spreadsheet columns as projects (configurable column mapping)
- [ ] `pushTimeEntry` → appends a row to a time log sheet
- [ ] Adapter registered in `registry.ts` under key `'google_sheets'`

### Trello Integration (`src/lib/integrations/trello.ts`)

- [ ] OAuth: Trello OAuth 1.0a
- [ ] `fetchProjects` → Trello boards
- [ ] `fetchTasks` → Trello cards from a board
- [ ] `pushTimeEntry` → Add comment to Trello card with time logged
- [ ] Adapter registered in `registry.ts` under key `'trello'`

### Infrastructure Scaling

- [ ] **PgBouncer / RDS Proxy**: Enable RDS Proxy in Terraform (`aws_db_proxy`), update `DATABASE_URL` to proxy endpoint — reduces connection overhead for 500+ concurrent orgs
- [ ] **RDS Read Replica**: `aws_db_instance` with `replicate_source_db`, update `DATABASE_READ_URL`
- [ ] **ECS Autoscaling**: Scale backend service between 2–10 tasks based on CPU > 70% for 3 minutes
- [ ] **Redis Cluster**: Migrate to `cluster.enabled = true` ElastiCache for horizontal scaling
- [ ] **ALB**: Health check on `GET /health`, 2/5 threshold
- [ ] **S3 Cross-Region Replication**: Enable on screenshots bucket to secondary region

### Disaster Recovery Runbook

Document in `docs/RUNBOOK.md`:

- [ ] **RDS Primary Failure**: RDS Multi-AZ auto-failover (< 60s). Steps: monitor CloudWatch, no manual action needed. Verify by checking `rds.ReplicaLag`.
- [ ] **Redis Cluster Failure**: Session tokens from JWT (stateless), so services continue. Reconnect via `ioredis` auto-retry. BullMQ retries jobs.
- [ ] **ECS Task Crash**: ALB stops routing to unhealthy target. New task starts from ECR image automatically.
- [ ] **S3 Bucket Unavailable**: Screenshot uploads fail gracefully (retry queue). Local SQLite retains data. Alerts fire.
- [ ] **DR Test Schedule**: Monthly — force a failover in staging, measure actual RTO. Target: < 15 minutes.

---

## Observability Setup

### Key Metrics to Track (Datadog Dashboards)

Create dashboard `TrackSync Production Overview`:
- `tracksync.sessions.synced_per_minute` — gauge
- `tracksync.screenshots.uploaded_per_minute` — gauge
- `tracksync.api.p99_latency_ms` by route — histogram
- `tracksync.queue.depth` by queue name — gauge
- `tracksync.queue.failed_jobs` — counter
- `tracksync.billing.suspended_orgs` — gauge
- `tracksync.db.connection_pool_utilisation` — gauge

### Alerts

- [ ] API p99 latency > 2s for 5 minutes → PagerDuty
- [ ] Queue depth > 1000 for 10 minutes → PagerDuty
- [ ] Error rate > 1% for 5 minutes → PagerDuty
- [ ] RDS CPU > 80% for 10 minutes → Slack alert
- [ ] Redis memory > 80% → Slack alert
- [ ] Disk space on ECS task > 85% → Slack alert

### Custom Metrics Instrumentation

```typescript
// src/lib/metrics.ts
import { trace, metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('tracksync-backend')
export const sessionSyncCounter = meter.createCounter('tracksync.sessions.synced', {
  description: 'Total sessions synced to backend'
})
export const screenshotUploadHistogram = meter.createHistogram('tracksync.screenshots.upload_duration_ms', {
  description: 'Time to upload and confirm screenshot to S3'
})
```

---

## Desktop App Tasks

### Sentry Integration

```typescript
import * as Sentry from '@sentry/electron/main'
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN_DESKTOP,
  environment: import.meta.env.MODE,
})
```
- [ ] In renderer: `@sentry/electron/renderer`
- [ ] Wrap all IPC handlers in try/catch → `Sentry.captureException`
- [ ] Attach `userId` and `orgId` to Sentry scope after login

### Correlation IDs from Desktop

- [ ] Axios instance: attach `X-Correlation-ID: uuid()` header per request (stored in React Query context)
- [ ] Log correlation IDs to `electron-log` for local debugging

### Desktop Crash Reporter

- [ ] `electron-log` writes to `app.getPath('logs')/tracksync.log`
- [ ] Include log upload button in Help menu → uploads `tracksync.log` to support (pre-signed S3 URL)

---

## Web Admin Panel Tasks

### Sentry Integration

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_WEB,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.05,
  integrations: [Sentry.replayIntegration()],
})
```

### Admin: Integrations — Additional Providers

- [ ] Add "Connect Google Sheets" and "Connect Trello" to `app/dashboard/integrations/page.tsx`
- [ ] Show integration type icon (SVG) for all four providers

### Public Changelog

- [ ] `app/(marketing)/changelog/page.tsx` — Static page listing release notes per version
- [ ] Desktop app "What's New" modal: shown once after auto-update using `electron-updater.currentVersion`

---

## Production Launch Checklist

Complete each item before flipping the "public" switch:

### Infrastructure
- [ ] Production AWS account separate from staging
- [ ] RDS Multi-AZ enabled, automated backups on (7-day retention)
- [ ] Redis Cluster with 2 shards
- [ ] ECS service: min 2 tasks, max 10
- [ ] ALB with WAF (AWS WAF with managed rule group)
- [ ] CloudFront for static assets (Next.js)
- [ ] Custom domain with SSL certificate (ACM)
- [ ] S3 Cross-Region Replication for screenshots

### Security
- [ ] External penetration test completed
- [ ] All secrets in Secrets Manager (zero in codebase or env files)
- [ ] Dependabot enabled for all three packages
- [ ] Security policy (`SECURITY.md`) with responsible disclosure process

### Legal
- [ ] Privacy Policy live at `/privacy`
- [ ] Terms of Service live at `/terms`
- [ ] DPA (Data Processing Agreement) downloadable at `/dpa`
- [ ] Cookie banner on marketing site (not app — no cookies in SaaS app)

### Monitoring
- [ ] Datadog dashboards set up with all key metrics
- [ ] PagerDuty on-call rotation configured
- [ ] Sentry alerts: `error_rate > 1%` and `new_issue` → assigned to on-call engineer
- [ ] UptimeRobot / Better Uptime monitoring `https://api.tracksync.io/health` every 1 minute

### Business
- [ ] Stripe products and prices configured in production
- [ ] Support email forwarding set up (`support@tracksync.io` → Intercom / Crisp)
- [ ] Status page (statuspage.io or similar) live at `status.tracksync.io`
- [ ] Beta feedback incorporated — top 5 issues from beta customers resolved

---

## Definition of Done

1. OpenTelemetry traces visible in Datadog APM with correct service name, operation, and user/org tags
2. Sentry captures and groups errors from all three services — includes correlation IDs
3. Structured logs include `correlationId` on every line — searchable in Datadog Logs
4. Google Sheets and Trello integrations work end-to-end (connect → sync projects → push time entry)
5. ECS service scales from 2 to 5 tasks under simulated load (k6 load test with 200 concurrent users)
6. RDS failover test: primary killed → app continues serving requests within 60 seconds
7. All items on production launch checklist above are checked off
8. Public launch: signup page is publicly accessible, first 10 organic signups tracked

---

## Testing Checklist

| Test | Type | Tool |
|------|------|------|
| OpenTelemetry spans appear in Datadog | Integration | Manual / Datadog UI |
| Sentry captures unhandled exception | Integration | Throw test error |
| Structured log has correlationId | Unit | Vitest |
| Google Sheets adapter fetches sheets | Unit | Vitest + mock |
| Trello adapter fetches boards + cards | Unit | Vitest + mock |
| Load test: 200 concurrent users, p99 < 1s | Performance | k6 |
| Load test: ECS autoscaling triggers | Performance | k6 + CloudWatch |
| RDS failover within 60s | DR Test | Manual + stop primary |
| S3 cross-region replication verified | Manual | Upload file, check replica |
| All launch checklist items | Manual | Checklist review |
