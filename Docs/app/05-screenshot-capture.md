# App Module 05 — Screenshot Capture

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 02 (Settings Sync), App Module 07 (Offline Sync Engine), Backend Module 07 (Screenshots & S3)

---

## Overview

Captures screenshots at org-defined intervals during an active session. Screenshots are **first saved to local disk and recorded in local SQLite**, then compressed and uploaded to S3 in the background. Users may be granted a grace period to delete screenshots before they reach the server (org-setting controlled).

---

## Local-First Screenshot Flow

```
[Interval fires — e.g., every 10 minutes]
    ↓
Capture screen (`screenshot-desktop` in Electron main)
    ↓
Save raw image to temp disk: ~/.tracksync/screenshots/<uuid>.png
    ↓
Insert into local_screenshots:
  { id, session_id, file_path, captured_at, sync_status: 'pending' }
    ↓
Show delete grace period countdown (if screenshot_user_delete_window > 0)
    ↓
If user deletes within window:
    → Delete temp file
    → Update local_screenshots: sync_status = 'deleted_by_user'
    → No upload ever happens
    ↓
If grace period expires (or no grace period):
    → Compress image (WebP, 80% quality) — saves ~80% size
    → Upload to S3 via /app/screenshots/upload
    → On success: delete temp file, update sync_status = 'synced'
    → On fail: keep temp file, increment retry_count, retry later
```

---

## Capture Implementation

All screenshot logic runs in the **Electron main process** via IPC. The renderer never captures screens or touches files — it only receives a file path + ID after the main process completes the capture.

```typescript
// src/main/ipc/screenshot-handlers.ts — Electron main process
import { ipcMain, app, Notification } from 'electron'
import screenshot from 'screenshot-desktop'   // npm: screenshot-desktop
import sharp from 'sharp'                       // npm: sharp (WebP compression)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getDbEncryptionKey } from '../db/key'

function getScreenshotsDir(): string {
  const dir = path.join(app.getPath('userData'), 'screenshots')
  mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('screenshot:capture', async () => {
  // 1. Capture all screens into a buffer (in memory — never writes raw to disk)
  const imgBuffer: Buffer = await screenshot({ format: 'png' })

  // 2. Compress to WebP at 80% quality in memory (reduces size ~80% vs PNG)
  const compressed: Buffer = await sharp(imgBuffer)
    .webp({ quality: 80 })
    .toBuffer()

  // 3. Retrieve encryption key from OS keychain (same key as local.db)
  const keyHex = await getDbEncryptionKey()
  const key = Buffer.from(keyHex, 'hex')

  // 4. AES-256-GCM encrypt in memory
  const iv = randomBytes(12)                          // 96-bit nonce
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()])
  const authTag = cipher.getAuthTag()                 // 128-bit authentication tag

  // 5. Write: [12 bytes IV][16 bytes authTag][ciphertext] → .enc file
  const payload = Buffer.concat([iv, authTag, encrypted])
  const fileId = uuidv4()
  const filePath = path.join(getScreenshotsDir(), `${fileId}.enc`)
  writeFileSync(filePath, payload)

  return { fileId, filePath }
})

// Decrypt for upload — called by sync engine
ipcMain.handle('screenshot:readForUpload', async (_event, filePath: string) => {
  const keyHex = await getDbEncryptionKey()
  const key = Buffer.from(keyHex, 'hex')

  const payload = readFileSync(filePath)
  const iv      = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const data    = payload.subarray(28)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])

  return plaintext   // returned as Buffer — streamed directly to HTTP upload, never written to disk
})
```

```typescript
// Renderer — schedule capture based on org settings
let screenshotTimer: ReturnType<typeof setInterval> | null = null

function startScreenshotScheduler(intervalMinutes: number) {
  screenshotTimer = setInterval(async () => {
    if (!isTrackingActive()) return
    const { fileId, filePath } = await window.electron.ipcRenderer.invoke('screenshot:capture')
    await saveLocalScreenshot(fileId, filePath)
    startDeleteCountdown(fileId, filePath)
  }, intervalMinutes * 60 * 1000)
}
```

> **Security note:** Screenshots never exist as plaintext on disk. The `.enc` file is AES-256-GCM encrypted immediately in the main process. Decryption happens only when uploading — the plaintext bytes are streamed directly to the HTTP client.

---

## Grace Period (User Delete Window)

> **Critical UX fix:** If the TrackSync window is minimized or hidden (user is tracking from the system tray), an in-app toast is completely invisible. The screenshot notification MUST fire as an OS-level notification so users always have a chance to review and delete.

```
Setting: screenshot_user_delete_window = 60 (seconds)

After capture:
    → Fire OS-level notification (platform notification center):
         Title: "TrackSync Screenshot Taken"
         Body:  "Screenshot captured at 9:10 AM. Delete within 60 seconds if needed."
         Action buttons:
           macOS:   [Delete Screenshot]  (notification action button)
           Windows: [Delete]             (toast action button)
           Linux:   notification only (action buttons limited by libnotify)
    → Also show in-app toast (if window is visible)
    → Countdown timer starts

    → If user clicks [Delete] in notification:
          → ipcRenderer.invoke('screenshot:delete', fileId)
          → File deleted from disk
          → local_screenshots.sync_status = 'deleted_by_user'
          → No record ever reaches server
          → Dismiss notification

    → If timer expires (no action):
          → Upload process begins
          → Dismiss notification

If screenshot_user_delete_window = 0:
    → No notification shown
    → Upload begins immediately
```

### OS Notification Implementation

```typescript
// src/main/ipc/screenshot-handlers.ts — Electron main process
import { Notification, ipcMain } from 'electron'

function notifyScreenshotTaken(
  fileId: string,
  deleteWindowSeconds: number,
  capturedTime: string
): void {
  if (deleteWindowSeconds === 0) return

  const notification = new Notification({
    title: 'TrackSync Screenshot Taken',
    body: `Screenshot captured at ${capturedTime}. Delete within ${deleteWindowSeconds} seconds if needed.`,
    actions: [{ type: 'button', text: 'Delete Screenshot' }],  // macOS action button
    closeButtonText: 'Dismiss',
  })

  notification.on('action', (_event, index) => {
    if (index === 0) {
      // User clicked "Delete Screenshot" — forward to renderer
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        'screenshot:delete_from_notification',
        fileId
      )
    }
  })

  notification.show()
}
```

```typescript
// Renderer: listen for the delete event forwarded from main process
import { ipcRenderer } from 'electron'

window.electron.ipcRenderer.on('screenshot:delete_from_notification', (_event, fileId: string) => {
  deleteScreenshot(fileId)
  showToast('Screenshot deleted')
})
```

> **Platform note:** Action buttons on notifications work natively on macOS. On Windows, `electron-windows-notifications` or `node-notifier` with NSIS toast actions provide similar UX. On Linux, action button support depends on the notification daemon.

---

## Compression Strategy

| Step | Tool | Output |
|------|------|--------|
| Capture | `screenshot-desktop` (Node.js) | Raw PNG (~2-5 MB) |
| Resize | Resize to max 1920px width | ~50% size reduction |
| Compress | WebP at 80% quality | Final ~200-500 KB |
| Thumbnail | 300px wide WebP | ~20 KB (for list views) |

Both the full image and thumbnail are uploaded to S3.

---

## Local Storage (SQLite)

```sql
local_screenshots
  id                    TEXT PRIMARY KEY
  session_id            TEXT FK → local_sessions
  file_path             TEXT               -- absolute path on disk
  captured_at           INTEGER            -- Unix timestamp
  activity_score        INTEGER            -- attached from activity module
  sync_status           TEXT DEFAULT 'pending'
                                           -- pending | uploading | synced
                                           -- failed | deleted_by_user
  server_screenshot_id  TEXT               -- NULL until synced
  retry_count           INTEGER DEFAULT 0
  last_attempt_at       INTEGER
```

---

## Upload: Decrypting Before Send

The sync engine (main process) calls `screenshot:readForUpload` via a direct function call (no IPC needed within main process):

```typescript
// src/main/sync/screenshot-uploader.ts
import { ipcMain } from 'electron'

// Called internally by sync engine — not exposed to renderer
async function uploadScreenshot(filePath: string, uploadUrl: string): Promise<void> {
  // Decrypt in memory via the same handler function (direct call)
  const plaintext: Buffer = await readScreenshotForUpload(filePath)

  // Stream directly to S3 presigned URL — plaintext never written to disk
  await fetch(uploadUrl, {
    method: 'PUT',
    body: plaintext,
    headers: { 'Content-Type': 'image/webp' }
  })
}
```

## Upload Retry Logic

```
On each sync worker pass:
    → SELECT * FROM local_screenshots WHERE sync_status IN ('pending', 'failed')
       AND retry_count < 10
       AND (last_attempt_at IS NULL OR last_attempt_at < now - backoff)
    → For each: attempt upload
    → On success: sync_status = 'synced', delete temp file
    → On fail: retry_count++, last_attempt_at = now, apply backoff

Backoff schedule (retry_count → wait before next attempt):
  0 → immediate
  1 → 30 seconds
  2 → 2 minutes
  3 → 5 minutes
  4+ → 15 minutes
  10+ → marked 'failed' permanently, flagged for manual review
```

---

## Platform Differences

| Platform | Screenshot Method | Permission Required |
|----------|-----------------|-------------------|
| macOS | `screenshot-desktop` → `CGWindowListCreateImage` | Screen Recording (System Settings) |
| Windows | `BitBlt` / Desktop Duplication API | None required |
| Linux | `XGetImage` (X11) / `wlr-screencopy` (Wayland) | None required |

On macOS: if permission not granted and screenshots_enabled = true → show in-app guide to grant permission (see Module 01).

---

## Settings Impact

| Setting | Effect |
|---------|--------|
| `screenshots_enabled = false` | Module entirely disabled, no captures |
| `screenshot_interval = 5` | Fires every 5 minutes |
| `screenshot_blur = true` | Backend blurs image server-side before showing in panel |
| `screenshot_user_delete_window = 0` | No grace period — upload immediately |
| `screenshot_user_delete_window = 120` | User has 2 minutes to delete |

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/app/screenshots/upload` | Upload compressed image + thumbnail to S3 via backend |
| DELETE | `/app/screenshots/:id` | Delete within grace period (if already uploaded) |
