# Backend Module 12 — Sync Queue & Background Jobs

**Stack:** Node.js + BullMQ + Redis + PostgreSQL  
**Used by:** Integration Engine, Screenshot processing, Billing, Email notifications

---

## Overview

All background processing runs through BullMQ queues backed by Redis. This includes integration syncs, screenshot S3 cleanup, billing grace period enforcement, email delivery, and audit log processing. Queues provide retry, backoff, and job monitoring.

---

## Queue Inventory

| Queue Name           | Purpose                                   | Concurrency |
| -------------------- | ----------------------------------------- | ----------- |
| `integration-sync`   | Sync projects + tasks from external tools | 5 workers   |
| `screenshot-process` | S3 upload, blur, thumbnail, deletion      | 10 workers  |
| `email`              | Send transactional emails                 | 3 workers   |
| `billing-grace`      | Enforce billing cutoff after grace period | 1 worker    |
| `session-complete`   | Post-session cleanup (activity rollup)    | 5 workers   |
| `audit-log`          | Async audit log writes (non-blocking)     | 2 workers   |
| `data-purge`         | GDPR data deletion for cancelled orgs     | 1 worker    |

---

## Job Deduplication (Race Condition Prevention)

> Without deduplication, two simultaneous sync triggers for the same org (e.g., webhook + scheduled cron) add duplicate jobs. Both run concurrently, causing API rate limit hits and duplicate data writes to Jira/Sheets/Linear.

```typescript
// BullMQ jobId-based deduplication:
// Same jobId = second add is silently ignored if first is still waiting

// Integration sync: one active job per org per integration
await integrationSyncQueue.add(
  'sync',
  { org_id, integration_id, sync_type: 'incremental' },
  {
    jobId: `sync:${org_id}:${integration_id}`, // ← dedup key
    removeOnComplete: { age: 3600 },
    removeOnFail: { count: 100 },
  }
)

// Screenshot upload: deduplicate per screenshot local ID
await screenshotUploadQueue.add(
  'upload',
  { local_screenshot_id, org_id, user_id },
  {
    jobId: `screenshot:${local_screenshot_id}`,
  }
)

// Session sync: deduplicate per session local ID (prevents duplicate sessions on re-sync)
await sessionSyncQueue.add(
  'sync_session',
  { local_session_id, org_id, user_id },
  {
    jobId: `session:${local_session_id}`,
  }
)
```

## Queue Definitions

### `integration-sync`

```typescript
// Triggered by:
// - Cron: every 15 minutes for all active orgs
// - Manual: when org admin connects/reconnects integration
// - Webhook: when external tool sends change notification

interface IntegrationSyncJob {
  orgId: string
  integrationId: string
  syncType: 'full' | 'delta'
  since?: string  // ISO timestamp for delta
}

worker.process('integration-sync', async (job: Job<IntegrationSyncJob>) => {
  const { orgId, integrationId, syncType, since } = job.data

  await syncProjectsAndTasks(orgId, integrationId, syncType, since)
  await updateLastSynced(integrationId)

  // Report progress for admin panel display
  await job.updateProgress(100)
})

// Job options:
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },     // keep 1h
  removeOnFail: { age: 24 * 3600 }     // keep 24h for debugging
}
```

### `screenshot-process`

```typescript
interface ScreenshotProcessJob {
  type: 'upload' | 'delete' | 'blur'
  screenshotId: string
  s3Key?: string
}

// Upload job: triggered by desktop sync (now handled directly in upload endpoint)
// Delete job: triggered when screenshot is marked deleted
worker.process('screenshot-process', async (job) => {
  if (job.data.type === 'delete') {
    await s3.deleteObject({ Bucket, Key: job.data.s3Key })
    await s3.deleteObject({ Bucket, Key: thumbnailKey(job.data.s3Key) })
  }
})
```

### `email`

```typescript
interface EmailJob {
  to: string
  template: 'invite' | 'payment_failed' | 'suspended' | 'reinstated' | 'welcome'
  variables: Record<string, string>
}

worker.process('email', async (job: Job<EmailJob>) => {
  await resend.emails.send({
    from: 'TrackSync <noreply@tracksync.io>',
    to: job.data.to,
    subject: getSubject(job.data.template),
    html: renderTemplate(job.data.template, job.data.variables),
  })
})
```

### `billing-grace`

```typescript
interface BillingGraceJob {
  orgId: string
}

// Added with a 3-day delay when payment fails
// Checks if payment is still outstanding before suspending

worker.process('billing-grace', async (job: Job<BillingGraceJob>) => {
  const org = await getOrg(job.data.orgId)

  if (org.billing_status !== 'overdue') {
    // Payment was received during grace period — nothing to do
    return
  }

  const settings = await getOrgSettings(org.id)
  if (!settings.billing_cutoff_auto) {
    // Auto-cutoff disabled — notify super admin instead
    await notifySuperAdmin(org, 'Payment overdue — manual action required')
    return
  }

  // Suspend
  await suspendOrg(org.id, 'Non-payment (auto-suspended after grace period)', 'system')
})
```

### `session-complete`

```typescript
// Triggered after a session is completed + synced
// Computes rollup stats for faster report queries

interface SessionCompleteJob {
  sessionId: string
}

worker.process('session-complete', async (job) => {
  await computeSessionActivityScore(job.data.sessionId)
  await updateProjectLastActivity(job.data.sessionId)
  await updateUserLastActive(job.data.sessionId)
})
```

### `data-purge`

```typescript
// GDPR compliance: purge data for cancelled orgs after 90 days

// Scheduled by cron: daily
cron.schedule('0 3 * * *', async () => {
  // 3 AM daily
  const expiredOrgs = await prisma.organization.findMany({
    where: {
      status: 'cancelled',
      updated_at: { lte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  })
  for (const org of expiredOrgs) {
    await dataPurgeQueue.add('purge-org', { orgId: org.id })
  }
})

worker.process('data-purge', async (job) => {
  const { orgId } = job.data

  // 1. Delete all S3 screenshots for org
  await deleteS3Folder(`orgs/${orgId}/`)

  // 2. Delete DB records (in dependency order)
  await prisma.$transaction([
    prisma.activity_logs.deleteMany({ where: { org_id: orgId } }),
    prisma.screenshots.deleteMany({ where: { org_id: orgId } }),
    prisma.time_sessions.deleteMany({ where: { org_id: orgId } }),
    prisma.work_log_exports.deleteMany({ where: { user: { org_id: orgId } } }),
    prisma.users.deleteMany({ where: { org_id: orgId } }),
    prisma.org_integrations.deleteMany({ where: { org_id: orgId } }),
    prisma.org_settings.deleteMany({ where: { org_id: orgId } }),
    prisma.organization.delete({ where: { id: orgId } }),
  ])
})
```

---

## BullMQ Dashboard

Bull Board UI mounted at `/internal/queues` (IP-restricted, not public):

```typescript
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'

const serverAdapter = new FastifyAdapter()
createBullBoard({
  queues: [
    new BullMQAdapter(integrationSyncQueue),
    new BullMQAdapter(screenshotQueue),
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(billingGraceQueue),
  ],
  serverAdapter,
})
```

---

## Cron Schedule Summary

| Job                   | Schedule     | Purpose                     |
| --------------------- | ------------ | --------------------------- |
| Integration sync      | Every 15 min | Keep projects + tasks fresh |
| Billing overdue check | Daily 9 AM   | Reminder emails             |
| Data purge            | Daily 3 AM   | GDPR compliance             |
| Sync stats            | Every 5 min  | Update dashboard metrics    |
| Refresh token cleanup | Daily 2 AM   | Remove expired tokens       |
