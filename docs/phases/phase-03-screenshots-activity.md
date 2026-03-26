# Phase 3 — Screenshots & Activity Tracking (Week 9–11)

## Goal

While a timer is running, the Desktop App captures encrypted screenshots at a configurable interval, persists them locally in encrypted files, and uploads them to S3 via a background BullMQ job. Simultaneously, keyboard/mouse activity data is collected, an activity score is computed per 10-minute window, and activity logs are synced to the backend. Employees are notified every time a screenshot is taken.

---

## Prerequisites

- Phase 2 complete: Timer is running and SQLite local sessions exist
- S3 bucket with KMS key configured
- `OrgSettings` table has `screenshot_interval_seconds`, `blur_screenshots`, `screenshot_retention_days`
- Backend: `TimeSession` table exists and sync is working

---

## Key Packages to Install

### Desktop

```bash
pnpm add screenshot-desktop sharp
pnpm add iohook active-win
pnpm add -D @types/sharp
```

> **Note:** `iohook` requires a native rebuild for the Electron version. Add `electron-rebuild` to `devDependencies` and run it post-install.

```bash
pnpm add -D electron-rebuild
# in package.json postinstall: electron-rebuild -f -w iohook
```

### Backend

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm add @aws-sdk/client-kms
pnpm add sharp                   # resize/validate screenshot on ingest
```

---

## Database Migrations

### PostgreSQL (Prisma)

```prisma
model Screenshot {
  id              String    @id @default(uuid())
  session_id      String
  user_id         String
  org_id          String
  s3_key          String    @unique
  taken_at        DateTime
  activity_score  Float     @default(0)
  is_blurred      Boolean   @default(false)
  file_size_bytes Int       @default(0)
  deleted_at      DateTime?             // soft-delete for retention policy
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  session         TimeSession  @relation(fields: [session_id], references: [id])
  user            User         @relation(fields: [user_id], references: [id])
}

model ActivityLog {
  id               String   @id @default(uuid())
  session_id       String
  user_id          String
  org_id           String
  window_start     DateTime
  window_end       DateTime
  keyboard_events  Int      @default(0)
  mouse_clicks     Int      @default(0)
  mouse_distance_px Int     @default(0)
  active_app       String?
  active_url       String?
  activity_score   Float    @default(0)
  created_at       DateTime @default(now())

  session          TimeSession @relation(fields: [session_id], references: [id])
  user             User        @relation(fields: [user_id], references: [id])

  @@index([user_id, window_start])
  @@index([session_id])
}
```

Run:

```bash
pnpm prisma migrate dev --name phase-03-screenshots-activity
```

### Local SQLite Schema (add to `001_initial.sql` or new `002_screenshots.sql`)

```sql
CREATE TABLE IF NOT EXISTS local_screenshots (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  taken_at        TEXT NOT NULL,
  activity_score  REAL DEFAULT 0,
  file_size_bytes INTEGER DEFAULT 0,
  synced          INTEGER DEFAULT 0,   -- 0 = pending upload, 1 = uploaded
  sync_attempts   INTEGER DEFAULT 0,
  last_sync_error TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_activity_logs (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL,
  window_start     TEXT NOT NULL,
  window_end       TEXT NOT NULL,
  keyboard_events  INTEGER DEFAULT 0,
  mouse_clicks     INTEGER DEFAULT 0,
  mouse_distance_px INTEGER DEFAULT 0,
  active_app       TEXT,
  active_url       TEXT,
  activity_score   REAL DEFAULT 0,
  synced           INTEGER DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_screenshots_synced ON local_screenshots(synced);
CREATE INDEX IF NOT EXISTS idx_local_activity_synced ON local_activity_logs(synced);
```

---

## Files to Create

| File                                     | Description                                         |
| ---------------------------------------- | --------------------------------------------------- |
| `src/main/screenshot/capture.ts`         | Capture + compress + encrypt screenshot             |
| `src/main/screenshot/scheduler.ts`       | Interval-based screenshot trigger                   |
| `src/main/screenshot/notify.ts`          | OS notification on capture                          |
| `src/main/sync/screenshotSync.ts`        | Read unsynced screenshots, upload to S3 via backend |
| `src/main/activity/inputMonitor.ts`      | `iohook` keyboard/mouse listeners                   |
| `src/main/activity/activeWin.ts`         | Poll `active-win` every 5s                          |
| `src/main/activity/scorer.ts`            | Compute activity score per window                   |
| `src/main/activity/windowBuffer.ts`      | 10-min rolling window aggregation                   |
| `src/main/sync/activitySync.ts`          | Batch-push activity logs to backend                 |
| `src/routes/screenshots/upload.ts`       | Backend: `POST /v1/screenshots/upload-url`          |
| `src/routes/screenshots/list.ts`         | Backend: `GET /v1/screenshots` + signed URL         |
| `src/routes/screenshots/confirm.ts`      | Backend: `POST /v1/screenshots/confirm`             |
| `src/routes/activity/sync.ts`            | Backend: `POST /v1/activity/batch`                  |
| `src/queues/workers/screenshotWorker.ts` | BullMQ worker: S3 upload + KMS                      |
| `src/lib/s3.ts`                          | `uploadToS3`, `generateSignedUrl`, `deleteFromS3`   |

---

## Backend Tasks

### Screenshot Upload Flow (3-step: presign → upload → confirm)

- [ ] `POST /v1/screenshots/upload-url`

  ```
  Request:  { session_id, taken_at, file_size_bytes, activity_score }
  Response: { upload_id, presigned_url, s3_key }
  ```

  - Validate `session_id` belongs to caller
  - Generate `s3_key = org_id/user_id/YYYY/MM/screenshotId.enc`
  - Return S3 presigned PUT URL (10 min expiry)
  - Create `Screenshot` record with `s3_key` but no confirmed flag yet

- [ ] `POST /v1/screenshots/confirm`

  ```
  Request:  { upload_id }
  Response: { screenshot }
  ```

  - Verify file actually exists in S3 (HeadObject)
  - Mark screenshot as confirmed, set `file_size_bytes`
  - Enqueue `screenshotWorker` job for any post-processing (blur if org setting is on)

- [ ] `GET /v1/screenshots`

  ```
  Query:    ?session_id=&user_id=&from=ISO&to=ISO&page=1&limit=20
  Response: { screenshots: [{ id, taken_at, activity_score, signed_url }] }
  ```

  - Generate signed URLs (15-min expiry) on the fly — never expose raw S3 keys to clients
  - Employees see only their own; managers see their team's; admins see all in org

- [ ] `DELETE /v1/screenshots/:id` (admin only)
  - Soft delete: set `deleted_at = now()`
  - Physical S3 deletion handled by nightly retention job (BullMQ scheduled)

### S3 Library (`src/lib/s3.ts`)

- [ ] `uploadToS3(key, body, contentType)` — `PutObjectCommand` with `ServerSideEncryption: 'aws:kms'`, `SSEKMSKeyId: config.KMS_SCREENSHOT_KEY_ID`
- [ ] `generateSignedUrl(key, expiresIn)` — `getSignedUrl(s3, GetObjectCommand, { expiresIn })`
- [ ] `deleteFromS3(key)` — `DeleteObjectCommand`
- [ ] `objectExists(key)` — `HeadObjectCommand` wrapped in try/catch

### Activity Sync API

- [ ] `POST /v1/activity/batch`
  ```
  Request:
  {
    logs: [
      {
        id: string,
        session_id: string,
        window_start: string,
        window_end: string,
        keyboard_events: number,
        mouse_clicks: number,
        mouse_distance_px: number,
        active_app?: string,
        active_url?: string,
        activity_score: number
      }
    ]
  }
  Response: { synced: [id], errors: [{ id, reason }] }
  ```

  - Upsert by `id` — idempotent
  - Validate `session_id` belongs to caller

### BullMQ Worker: Screenshot Processing

- [ ] `src/queues/workers/screenshotWorker.ts`:
  - Job data: `{ screenshotId, s3Key, orgId }`
  - If `org.settings.blur_screenshots`: download from S3, blur with `sharp`, re-upload
  - Update `Screenshot.is_blurred = true`

### Retention Job

- [ ] `src/queues/workers/retentionWorker.ts`:
  - Scheduled: nightly at 02:00 UTC (BullMQ cron)
  - For each org: find screenshots where `taken_at < now() - screenshot_retention_days`
  - S3 delete + set `deleted_at`

---

## Desktop App Tasks

### Screenshot Capture (`src/main/screenshot/capture.ts`)

- [ ] `captureAndStore(sessionId)`:

  ```typescript
  import screenshot from 'screenshot-desktop'
  import sharp from 'sharp'
  import { createCipheriv, randomBytes } from 'crypto'
  import { writeFileSync } from 'fs'
  import { getDbEncryptionKey } from '../db/key'
  import { getDb } from '../db'

  export async function captureAndStore(sessionId: string): Promise<void> {
    // 1. Capture screen
    const png = await screenshot({ format: 'png' })
    // 2. Compress to WebP
    const webp = await sharp(png).webp({ quality: 80 }).toBuffer()
    // 3. Encrypt AES-256-GCM
    const keyHex = await getDbEncryptionKey()
    const key = Buffer.from(keyHex, 'hex')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(webp), cipher.final()])
    const authTag = cipher.getAuthTag()
    const payload = Buffer.concat([iv, authTag, encrypted])
    // 4. Save to userData/screenshots/
    const fileId = crypto.randomUUID()
    const filePath = path.join(app.getPath('userData'), 'screenshots', `${fileId}.enc`)
    writeFileSync(filePath, payload)
    // 5. Record in SQLite
    getDb()
      .prepare(
        `
      INSERT INTO local_screenshots (id, session_id, file_path, taken_at, file_size_bytes, synced, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `
      )
      .run(
        fileId,
        sessionId,
        filePath,
        new Date().toISOString(),
        payload.length,
        new Date().toISOString()
      )
    // 6. Notify user
    showCaptureNotification()
  }
  ```

- [ ] `showCaptureNotification()`:
  ```typescript
  new Notification({
    title: 'TrackSync',
    body: 'Screenshot captured',
    silent: true,
  }).show()
  ```

### Screenshot Scheduler (`src/main/screenshot/scheduler.ts`)

- [ ] Start scheduler when timer starts, stop when timer stops
- [ ] Use `setInterval` with `intervalSeconds * 1000` from org settings
- [ ] Add ±15s jitter to avoid obvious "every 5 minutes" pattern
  ```typescript
  const jitter = Math.floor(Math.random() * 30 - 15) * 1000
  setTimeout(() => captureAndStore(sessionId), jitter)
  ```

### Screenshot Sync (`src/main/sync/screenshotSync.ts`)

- [ ] Read unsynced rows from `local_screenshots`
- [ ] For each: decrypt in memory → POST presigned URL request → PUT file to S3 → confirm upload
- [ ] Mark `synced = 1` in SQLite after confirmation
- [ ] Retry with backoff on failure (max 5 attempts, then skip + log error)
- [ ] Delete local `.enc` file after successful sync (optional, based on a cleanup setting)

### Activity Monitor (`src/main/activity/inputMonitor.ts`)

- [ ] Start/stop with timer:

  ```typescript
  import ioHook from 'iohook'

  let keyboardCount = 0
  let mouseClickCount = 0
  let mouseDistancePx = 0
  let lastMousePos = { x: 0, y: 0 }

  export function startInputMonitoring(): void {
    ioHook.on('keydown', () => {
      keyboardCount++
    })
    ioHook.on('mouseclick', () => {
      mouseClickCount++
    })
    ioHook.on('mousemove', (e: { x: number; y: number }) => {
      const dx = e.x - lastMousePos.x
      const dy = e.y - lastMousePos.y
      mouseDistancePx += Math.sqrt(dx * dx + dy * dy)
      lastMousePos = { x: e.x, y: e.y }
    })
    ioHook.start()
  }

  export function flushAndReset(): {
    keyboard: number
    mouseClicks: number
    mouseDistance: number
  } {
    const counts = {
      keyboard: keyboardCount,
      mouseClicks: mouseClickCount,
      mouseDistance: Math.floor(mouseDistancePx),
    }
    keyboardCount = 0
    mouseClickCount = 0
    mouseDistancePx = 0
    return counts
  }
  ```

### Active Window Polling (`src/main/activity/activeWin.ts`)

- [ ] Poll `active-win` every 5 seconds during active session
- [ ] Store `{ app, url?, title }` in rolling buffer
- [ ] Most-active app in the 10-min window = `active_app` for that window's activity log

### Activity Score (`src/main/activity/scorer.ts`)

- [ ] Computed per 10-minute window using org weights:
  ```typescript
  export function computeActivityScore(
    keyboard: number,
    mouseClicks: number,
    mouseDistance: number,
    baseline: { keyboard: number; mouseClicks: number; mouseDistance: number },
    weights: { keyboard: number; mouse: number; movement: number }
  ): number {
    const kScore = Math.min(keyboard / (baseline.keyboard || 1), 1)
    const mScore = Math.min(mouseClicks / (baseline.mouseClicks || 1), 1)
    const dScore = Math.min(mouseDistance / (baseline.mouseDistance || 1), 1)
    return (kScore * weights.keyboard + mScore * weights.mouse + dScore * weights.movement) * 100
  }
  ```

### 10-Minute Window Aggregator (`src/main/activity/windowBuffer.ts`)

- [ ] Flush every 10 minutes: aggregate counts → compute score → write to `local_activity_logs` → reset counters

### IPC Handlers

- [ ] `ipcMain.handle('activity:current-stats', () => ({ keyboard: keyboardCount, mouseClicks: mouseClickCount, score: lastScore }))` — for live display in renderer

---

## Definition of Done

1. Screenshot file appears in `userData/screenshots/*.enc` within the configured interval after timer starts
2. Screenshot `.enc` file is AES-256-GCM encrypted — raw binary, not readable without key
3. Sync uploads the file to S3 with SSE-KMS encryption
4. `GET /v1/screenshots` returns a signed URL; the URL serves the original screenshot (or blurred if org setting is on)
5. OS notification fires after each screenshot
6. Activity log is written to `local_activity_logs` every 10 minutes while timer runs
7. Activity logs sync to backend and appear in `ActivityLog` table
8. Activity score is between 0–100 and reflects actual keyboard/mouse usage
9. Stopping timer stops all monitoring (no iohook events, no screenshot scheduler)
10. Retention job deletes screenshots older than `screenshot_retention_days` from S3

---

## Testing Checklist

| Test                                                       | Type        | Tool                          |
| ---------------------------------------------------------- | ----------- | ----------------------------- |
| `captureAndStore` creates encrypted file on disk           | Integration | Vitest (Electron test env)    |
| `computeActivityScore` returns correct value               | Unit        | Vitest                        |
| 10-min window flush writes to SQLite                       | Unit        | Vitest + in-memory SQLite     |
| `screenshotSync` uploads and confirms                      | Integration | Vitest + S3 mock (localstack) |
| `POST /v1/screenshots/upload-url` returns presigned URL    | Integration | Vitest + supertest            |
| `POST /v1/screenshots/confirm` verifies S3 object exists   | Integration | Vitest + localstack           |
| `GET /v1/screenshots` returns signed URL (not raw key)     | Integration | Vitest                        |
| IDOR: cannot confirm screenshot for another user's session | Integration | Vitest                        |
| Blur job blurs image correctly                             | Integration | Vitest + sharp                |
| Retention job deletes old screenshots                      | Integration | Vitest                        |
