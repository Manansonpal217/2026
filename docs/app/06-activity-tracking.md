# App Module 06 — Activity Tracking

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 02 (Settings Sync), App Module 07 (Offline Sync Engine), Backend Module 08 (Activity Logs)

---

## Overview

Every 60 seconds during an active session, records keyboard event count, mouse click count, mouse movement distance, active app name, and (optionally) active URL. Computes an activity score per interval. Data is first stored in local SQLite and synced to the server when online.

---

## What Gets Measured

| Metric          | What Is Captured                 | What Is NOT Captured   |
| --------------- | -------------------------------- | ---------------------- |
| Keyboard events | Count of keystrokes per interval | What was typed (never) |
| Mouse events    | Click count per interval         | Where on screen        |
| Mouse distance  | Pixels moved per interval        | Path or coordinates    |
| Active app      | App name + window title          | Window contents        |
| Active URL      | Browser URL (if enabled)         | Page content           |

> Privacy: only counts and metadata — never content.

---

## Activity Score Formula

```
score = min(100,
  (keyboard_events  * 0.4) +
  (mouse_events     * 0.3) +
  (mouse_distance / 1000 * 0.3)
)
```

Thresholds for display:

- 0–30: 🔴 Low activity
- 31–60: 🟡 Moderate activity
- 61–100: 🟢 High activity

---

## Collection Flow (Every 60 Seconds)

```
[60-second interval fires in main process]
    → Read accumulated counters (reset after reading):
        keyboard_events (count since last interval)
        mouse_events    (count since last interval)
        mouse_distance  (pixels since last interval)
    → Read active app name (OS API via iohook / active-win)
    → Read active URL (if track_url = true, via accessibility API)
    → Compute activity_percent
    → Insert into local_activity_logs via better-sqlite3:
        { session_id, recorded_at, keyboard_events, mouse_events,
          mouse_distance_px, active_app, active_url, activity_percent,
          sync_status: 'pending' }
    → Send updated activity to renderer via ipcMain.emit:
        BrowserWindow.send('activity:update', { percent })
```

---

## Node.js Implementation (Electron Main Process)

```typescript
// src/main/activity/input-monitor.ts
// npm: iohook — cross-platform low-level keyboard/mouse hooks for Node.js
// Alternative: @paymoapp/electron-mouse-tracker for mouse distance

import ioHook from 'iohook'

let keyboardCount = 0
let mouseClickCount = 0
let mouseDistancePx = 0
let lastMouseX = 0
let lastMouseY = 0

export function startInputMonitoring(): void {
  // DO NOT log key content — only count events
  ioHook.on('keydown', () => {
    keyboardCount++
  })
  ioHook.on('mouseclick', () => {
    mouseClickCount++
  })
  ioHook.on('mousemove', (event: { x: number; y: number }) => {
    const dx = event.x - lastMouseX
    const dy = event.y - lastMouseY
    mouseDistancePx += Math.sqrt(dx * dx + dy * dy)
    lastMouseX = event.x
    lastMouseY = event.y
  })

  ioHook.start()
}

export function getAndResetActivitySnapshot() {
  const snapshot = {
    keyboard_events: keyboardCount,
    mouse_events: mouseClickCount,
    mouse_distance_px: Math.round(mouseDistancePx),
  }
  // Atomically reset counters
  keyboardCount = 0
  mouseClickCount = 0
  mouseDistancePx = 0
  return snapshot
}

export function stopInputMonitoring(): void {
  ioHook.stop()
  ioHook.unload()
}
```

---

## Active App / URL Detection

```typescript
// src/main/activity/active-window.ts
// npm: active-win — cross-platform active window info

import activeWin from 'active-win'

export async function getActiveApp(): Promise<{ name: string; windowTitle: string }> {
  const result = await activeWin()
  return {
    name: result?.owner?.name ?? 'Unknown',
    windowTitle: result?.title ?? '',
  }
}

// URL detection (only if track_url = true)
// Uses Accessibility API for: Chrome, Firefox, Safari, Edge, Arc
// npm: browser-url-monitor or custom AppleScript/COM automation per platform
export async function getActiveUrl(): Promise<string | null> {
  const win = await activeWin()
  const browserName = win?.owner?.name?.toLowerCase() ?? ''

  if (browserName.includes('chrome') || browserName.includes('arc')) {
    return getChromiumUrl() // via chrome.debugger or AppleScript
  }
  if (browserName.includes('safari')) {
    return getSafariUrl() // via AppleScript on macOS
  }
  return null
}
```

---

## Local Storage (SQLite)

```sql
local_activity_logs
  id                TEXT PRIMARY KEY
  session_id        TEXT FK → local_sessions
  recorded_at       INTEGER            -- Unix timestamp
  interval_seconds  INTEGER DEFAULT 60
  keyboard_events   INTEGER
  mouse_events      INTEGER
  mouse_distance_px INTEGER
  active_app        TEXT
  active_url        TEXT               -- NULL if tracking disabled
  activity_percent  INTEGER
  sync_status       TEXT DEFAULT 'pending'   -- pending | synced | failed
```

---

## Idle Detection (Integrated)

```
Monitor activity counters continuously:

If keyboard_events = 0 AND mouse_events = 0 AND mouse_distance < 50px
    for idle_timeout_minutes:
        → Pause accumulating activity data
        → Show idle popup (see Module 04)

On user activity resuming:
    → Clear idle counter
    → Resume activity recording
```

---

## Sync to Server

Activity logs are picked up by the sync worker (Module 07):

```
SELECT * FROM local_activity_logs WHERE sync_status = 'pending'
    → POST /app/activity-logs (batch, up to 100 rows per request)
    → On success: UPDATE sync_status = 'synced'
```

Batch size prevents large payloads after long offline periods.

---

## Settings Impact

| Setting                             | Effect                                       |
| ----------------------------------- | -------------------------------------------- |
| `activity_tracking_enabled = false` | Module entirely off, no recording            |
| `track_keyboard = false`            | keyboard_events always 0                     |
| `track_mouse = false`               | mouse_events + mouse_distance always 0       |
| `track_app_usage = false`           | active_app always NULL                       |
| `track_url = false`                 | active_url always NULL                       |
| `idle_detection_enabled = false`    | No idle popup, idle time included in session |

---

## API Endpoints Used

| Method | Endpoint             | Purpose                           |
| ------ | -------------------- | --------------------------------- |
| POST   | `/app/activity-logs` | Batch upload activity log records |
