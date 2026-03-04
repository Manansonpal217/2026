# Backend Module 07 — Screenshots & S3 Storage

**Stack:** Node.js + Fastify + AWS S3 + CloudFront CDN + PostgreSQL  
**Used by:** Desktop App (upload), Admin Panel (view)

---

## Overview

Receives screenshot uploads from the desktop sync engine, stores them in private S3 buckets, generates signed URLs for viewing, and enforces the delete grace period. Screenshots arrive compressed from the desktop app.

---

## Database Table

```sql
screenshots
  id                     UUID PRIMARY KEY
  session_id             UUID FK → time_sessions
  user_id                UUID FK → users
  org_id                 UUID FK → organizations
  s3_key                 VARCHAR
  thumbnail_s3_key       VARCHAR
  captured_at            TIMESTAMP
  is_deleted             BOOLEAN DEFAULT false
  deleted_at             TIMESTAMP
  delete_window_expires  TIMESTAMP          -- NULL if no grace period (or already expired)
  activity_score         INT                -- 0-100
```

---

## Upload Flow

```
Desktop app sends screenshot:
    → POST /app/screenshots/upload (multipart/form-data)
       Fields: session_id, captured_at, activity_score
       Files: image (compressed WebP), thumbnail (300px WebP)
    ↓
Backend:
  1. Validate session belongs to request.user
  2. Generate S3 keys:
       s3_key = orgs/{org_id}/{user_id}/{year}/{month}/{uuid}.webp
       thumbnail_key = orgs/{org_id}/{user_id}/{year}/{month}/{uuid}_thumb.webp
  3. Upload both files to private S3 bucket
  4. Create screenshots row
  5. Return: { screenshot_id, delete_window_expires }
```

---

## Endpoints

### Desktop App: Upload Screenshot
```typescript
POST /app/screenshots/upload
Content-Type: multipart/form-data

Fields: {
  session_id: string,
  captured_at: ISO_string,
  activity_score: number,
  local_screenshot_id: string   // for deduplication
}
Files: image, thumbnail

Response: {
  screenshot_id: string,
  delete_window_expires: ISO_string | null
}

Deduplication: check (user_id, captured_at) before creating — return existing if found
```

### Desktop App: Delete Screenshot (grace period)
```typescript
DELETE /app/screenshots/:id

Checks:
  1. screenshot.user_id === request.user.id
  2. now() < delete_window_expires  (still within grace period)
  3. is_deleted = false

Action:
  1. screenshots.is_deleted = true, deleted_at = now()
  2. Queue S3 deletion job (async — not blocking response)
  3. Return: 200 OK

If grace period expired: 409 Conflict — "Delete window has closed"
```

### Admin: Get Screenshots for User
```typescript
GET /admin/users/:user_id/screenshots?from=&to=&session_id=&page=&limit=

Response: {
  screenshots: [{
    id, captured_at, activity_score,
    thumbnail_url,   // signed CloudFront URL (1h expiry)
    is_deleted
  }],
  total, page
}
```

### Admin: Get Full Screenshot
```typescript
GET /admin/screenshots/:id/view

Action:
  1. Verify org_id matches (row-level security)
  2. Check is_deleted = false
  3. Generate signed S3/CloudFront URL (1-hour expiry)
  4. Return: { url }

Note: Never expose S3 key or raw S3 URL — always signed URLs only
```

### Admin: Delete Screenshot (admin override)
```typescript
DELETE /admin/screenshots/:id

Action:
  1. Mark is_deleted = true
  2. Queue S3 delete job
  3. Audit log (org admin deleting employee screenshot)
```

---

## KMS Encryption for S3 Screenshots

All objects in the screenshots S3 bucket are encrypted using AWS KMS (SSE-KMS):

```typescript
// Upload with KMS encryption
await s3.send(new PutObjectCommand({
  Bucket: S3_BUCKET,
  Key: s3Key,
  Body: imageBuffer,
  ContentType: 'image/webp',
  ServerSideEncryption: 'aws:kms',
  SSEKMSKeyId: process.env.KMS_SCREENSHOTS_KEY_ARN,  // dedicated KMS key for screenshots
}))
```

This means:
- Screenshots at rest in S3 are KMS-encrypted (not just AES-256-S3)
- Per-org data isolation: future option to use separate KMS keys per org (for enterprise)
- CloudTrail logs every decrypt operation — full audit trail of who viewed what screenshot

---

## S3 Bucket Configuration

```
Bucket: tracksync-screenshots-<region>
ACL: Private (no public access)
Versioning: Disabled (one version per screenshot)
Lifecycle rules:
  - Transition to S3 Glacier after 365 days
  - Delete after 3 years (configurable per enterprise plan)
```

**Folder structure:**
```
orgs/
  {org_id}/
    {user_id}/
      2026/
        03/
          {uuid}.webp
          {uuid}_thumb.webp
```

---

## Signed URL Generation

```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

async function generateSignedUrl(s3Key: string, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_SCREENSHOTS_BUCKET,
    Key: s3Key
  })
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds })
}
```

For CloudFront CDN delivery (faster global access):
```typescript
// Use CloudFront signed URLs with key pair
const signedUrl = cloudFrontSigner.getSignedUrl({
  url: `https://cdn.tracksync.io/${s3Key}`,
  expires: Math.floor(Date.now() / 1000) + 3600
})
```

---

## S3 Deletion Queue (BullMQ)

Deletions are async to avoid blocking the API response:

```typescript
// Add to queue when screenshot is marked deleted
await s3DeletionQueue.add('delete-screenshot', {
  s3_key: screenshot.s3_key,
  thumbnail_s3_key: screenshot.thumbnail_s3_key
})

// Worker
worker.process(async (job) => {
  await s3.deleteObject({ Bucket, Key: job.data.s3_key })
  await s3.deleteObject({ Bucket, Key: job.data.thumbnail_s3_key })
})
```

---

## Screenshot Blur (Server-Side)

When `screenshot_blur = true` for an org:
```typescript
// Applied on upload — blurred version stored as the primary s3_key
// Original never stored
import sharp from 'sharp'

const blurred = await sharp(imageBuffer).blur(10).toBuffer()
await uploadToS3(blurred, s3Key)
```

---

## Security

| Requirement | Implementation |
|-------------|---------------|
| No public access | S3 bucket ACL: private |
| Signed URLs only | All views via presigned URLs, 1h expiry |
| Org isolation | s3_key includes org_id prefix; queries filter by org_id |
| Role access | Only org_admin and manager can view screenshots |
| User delete right | Grace period enforced server-side (not just client-side) |
| Audit | Screenshot deletions by admins logged in audit_logs |
