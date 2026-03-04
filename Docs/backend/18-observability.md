# Backend Module 18 — Observability (OpenTelemetry + Datadog)

**Stack:** OpenTelemetry SDK + Datadog APM + Sentry  
**Coverage:** All backend services + BullMQ workers

---

## Overview

Three pillars of observability:
1. **Tracing** (OpenTelemetry): track a single request across all services with a correlation ID
2. **Metrics** (Datadog): dashboards for latency, error rates, queue depths, DB connection count
3. **Error Tracking** (Sentry): stack traces, user context, deployment markers

Without distributed tracing, debugging a "session sync failed" report means guessing which service failed among Fastify API → BullMQ worker → Jira API → S3. With tracing, you see the full call chain in Datadog.

---

## OpenTelemetry Setup

```typescript
// src/telemetry.ts — MUST be imported BEFORE any other module
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,  // Datadog Agent OTLP endpoint
  headers: {
    'DD-API-KEY': process.env.DD_API_KEY,
  },
})

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'tracksync-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  }),
  traceExporter: exporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-fastify': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },  // PostgreSQL queries
      '@opentelemetry/instrumentation-redis': { enabled: true },
      '@opentelemetry/instrumentation-bullmq': { enabled: true },
    })
  ]
})

sdk.start()
process.on('SIGTERM', () => sdk.shutdown())
```

---

## Correlation IDs

Every request gets a unique correlation ID that flows through all services:

```typescript
// Fastify plugin: generate or propagate correlation ID
fastify.addHook('onRequest', async (request, reply) => {
  // Use incoming trace ID if from another service, or generate new
  const correlationId = request.headers['x-correlation-id'] as string
    ?? request.headers['x-request-id'] as string
    ?? trace.getActiveSpan()?.spanContext().traceId
    ?? crypto.randomUUID()

  request.correlationId = correlationId
  reply.header('x-correlation-id', correlationId)

  // Add to all log entries for this request
  request.log = request.log.child({ correlationId })

  // Add to OpenTelemetry span
  trace.getActiveSpan()?.setAttribute('correlation.id', correlationId)
})
```

```typescript
// BullMQ workers: propagate correlation ID into background jobs
await syncQueue.add('sync', {
  org_id,
  correlation_id: request.correlationId,  // stored in job data
})

// In worker:
const worker = new Worker('sync', async (job) => {
  const span = tracer.startSpan('bullmq.sync', {
    attributes: { 'correlation.id': job.data.correlation_id }
  })
  // All work inside this span context
})
```

---

## Structured Logging

All logs are structured JSON (Fastify's built-in pino logger):

```typescript
// Every log line includes:
{
  "level": "info",
  "time": "2026-03-04T09:00:00.000Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "service": "tracksync-api",
  "version": "1.2.3",
  "env": "production",
  "msg": "Session sync completed",
  "sessionId": "...",
  "userId": "...",
  "orgId": "...",
  "durationMs": 145
}
```

> Never log PII: email addresses, names, screenshot content. Log IDs only.

---

## Key Metrics to Track

### API Performance

```typescript
// Custom Datadog metrics via StatsD
import { StatsD } from 'hot-shots'
const metrics = new StatsD({ host: 'localhost', port: 8125 })

// Request duration histogram (auto from OTel instrumentation)
// Custom business metrics:
metrics.increment('session.synced', 1, { org_id: orgId })
metrics.increment('screenshot.uploaded', 1, { org_id: orgId })
metrics.increment('integration.sync_completed', 1, { provider: 'jira' })
metrics.increment('auth.login_failed', 1, { reason: 'wrong_password' })
metrics.gauge('queue.screenshot_depth', queueDepth, { queue: 'screenshots' })
```

### Datadog Dashboard: TrackSync Production

| Panel | Metric | Alert |
|-------|--------|-------|
| API p99 latency | `trace.fastify.request.duration` | > 2000ms |
| Error rate | HTTP 5xx / total | > 1% |
| DB connections | `postgresql.connections` | > 80% of max |
| BullMQ queue depth | `queue.screenshot_depth` | > 10,000 |
| Session sync failures | `session.sync_failed` | > 100/min |
| Screenshot upload failures | `screenshot.upload_failed` | > 50/min |
| Active ECS tasks | `ecs.service.running_count` | < 2 |
| Redis memory | `redis.mem.used` | > 85% |

---

## Sentry — Error Tracking

```typescript
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 0.1,    // 10% of transactions for performance profiling
  profilesSampleRate: 0.1,
  beforeSend(event) {
    // Scrub PII before sending to Sentry
    if (event.user) {
      delete event.user.email    // don't send email
      delete event.user.username
    }
    return event
  }
})

// Attach user context (ID only, no PII)
Sentry.setUser({ id: user.id, orgId: user.org_id, role: user.role })

// Custom fingerprinting for known error types
Sentry.configureScope(scope => {
  scope.setTag('org_id', orgId)
  scope.setTag('correlation_id', correlationId)
})
```

---

## Alerting Policy

| Severity | Escalation | Examples |
|----------|-----------|---------|
| P0 — Critical | PagerDuty (immediate) | DB unreachable, all ECS tasks down |
| P1 — High | PagerDuty (15 min delay) | Error rate > 5%, queue depth > 50k |
| P2 — Medium | Slack `#ops-alerts` | Single task unhealthy, latency spike |
| P3 — Low | Datadog dashboard | Unusual but non-critical metric |
