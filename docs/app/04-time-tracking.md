# App Module 04 — Time Tracking

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 03 (Projects/Tasks), App Module 07 (Offline Sync Engine), Backend Module 06 (Time Sessions API)

---

## Overview

Core module. Handles start/stop/pause of time sessions. All session data is **written to local SQLite first** and synced to the server in the background. The timer runs in the **Electron main process** (Node.js `setInterval`), not in the renderer, to avoid background throttling when the window is minimized or hidden.

---

## Screen — Active Tracking (Screen 4)

```
┌────────────────────────────────────┐
│  🔴 TRACKING                       │
│  API-123: Fix auth bug             │
│                                    │
│         01:23:45                   │
│                                    │
│  📸 Next screenshot in: 4:32       │
│  ⌨️  Activity: ████████░░ 82%     │
│                                    │
│    [Pause]      [Stop & Log]       │
└────────────────────────────────────┘
```

---

## Session Lifecycle

### Start Session

```
User selects task → clicks [Start Tracking]
    → Validate: task selected (if force_task_selection = true)
    → Check: no other active session (prevent double-tracking)
    → Generate local UUID for session
    → Write to local_sessions:
        { id, task_id, project_id, started_at, status: 'active', sync_status: 'pending' }
    → Start timer in main process (ipcRenderer.invoke('timer:start', { sessionId }))
    → Start screenshot module (fires at org_settings.screenshot_interval)
    → Start activity module (records every 60s)
    → Navigate to Active Tracking screen
    → Background: POST /app/sessions/start → server creates time_sessions row
        → On success: local_sessions.server_session_id = <returned id>
        → On fail: continue locally, retry via sync worker
```

### Pause Session

```
User clicks [Pause]
    → OS timer paused
    → local_sessions.status = 'paused'
    → Screenshot module paused (no captures while paused)
    → Activity module paused
    → Display: "PAUSED" state with [Resume] button
    → Background: PATCH /app/sessions/:id/pause
```

### Resume Session

```
User clicks [Resume]
    → OS timer resumes
    → local_sessions.status = 'active'
    → Screenshot + activity modules resume
    → Background: PATCH /app/sessions/:id/resume
```

### Stop Session

```
User clicks [Stop & Log]
    → OS timer stopped
    → Calculate: duration_seconds = (now - started_at) - idle_seconds
    → Update local_sessions:
        { ended_at, duration_seconds, status: 'completed' }
    → Navigate to Log Work screen (Module 08)
    → Background: POST /app/sessions/:id/complete
        → On success: local_sessions.sync_status = 'synced'
```

### Idle Detection

```
User inactive for idle_timeout_minutes:
    → Show idle popup: "You've been idle for 5 minutes. Keep or discard idle time?"
    → [Keep All Time]  [Discard Idle Time]
    If discard:
        → idle_seconds += <idle duration>
        → local_sessions.idle_seconds updated
    Either way: timer continues from this point
```

### Switch Task (Without Stopping)

Employees often need to jump from one task to another without the full stop → log → restart flow. The Switch Task button reduces this from 5 steps to 1.

```
User clicks [Switch Task] on Active Tracking screen
    → Pause current timer
    → Save current elapsed time to local_sessions
    → Show task picker (full task list, same as Screen 3)
    → User selects new task
    → Option: "Log previous session now or later?"
        [Log Now]  [Save for Later]
    If Log Now:
        → Complete current session (go to Log Work screen for old session)
        → After logging: auto-start new session on new task
    If Save for Later:
        → Complete current session (status = 'completed', logged_externally = false)
        → Immediately start new session on new task
        → User can log the old session later from "Recent Sessions" tray menu
```

```
Updated Active Tracking Screen:
┌────────────────────────────────────┐
│  🔴 TRACKING                       │
│  API-123: Fix auth bug             │
│                                    │
│         01:23:45                   │
│                                    │
│  📸 Next screenshot in: 4:32       │
│  ⌨️  Activity: ████████░░ 82%     │
│                                    │
│  [Pause] [Switch Task] [Stop & Log]│
└────────────────────────────────────┘
```

### Discard Session

```
User clicks [Discard] on Log Work screen
    → local_sessions.status = 'discarded'
    → No server sync needed for discarded sessions
    → Navigate back to Project Selector
```

---

## Local Storage (SQLite)

```sql
local_sessions
  id                TEXT PRIMARY KEY
  server_session_id TEXT               -- NULL until synced with backend
  task_id           TEXT
  project_id        TEXT
  started_at        INTEGER            -- Unix timestamp
  ended_at          INTEGER            -- NULL if active/paused
  duration_seconds  INTEGER            -- updated live
  is_manual         INTEGER DEFAULT 0
  idle_seconds      INTEGER DEFAULT 0
  notes             TEXT
  status            TEXT               -- active | paused | completed | discarded
  sync_status       TEXT DEFAULT 'pending'   -- pending | synced | failed
  logged_externally INTEGER DEFAULT 0
  created_at        INTEGER
```

---

## Timer Implementation (Electron Main Process)

```typescript
// src/main/timer.ts — runs in Electron main process
// Main process is NOT throttled by Chromium's background timer policy
// Ensures accurate elapsed time even when window is hidden/minimized to tray

import { ipcMain, BrowserWindow } from 'electron'

interface ActiveTimer {
  sessionId: string
  startedAt: number // Date.now() at start
  pausedAt: number | null
  totalPausedMs: number
  interval: ReturnType<typeof setInterval>
}

let activeTimer: ActiveTimer | null = null

ipcMain.handle('timer:start', (_event, { sessionId }: { sessionId: string }) => {
  if (activeTimer) clearInterval(activeTimer.interval)

  const interval = setInterval(() => {
    if (!activeTimer || activeTimer.pausedAt) return
    const elapsed = Math.floor(
      (Date.now() - activeTimer.startedAt - activeTimer.totalPausedMs) / 1000
    )
    BrowserWindow.getAllWindows()[0]?.webContents.send('timer:tick', { sessionId, elapsed })
  }, 1000)

  activeTimer = { sessionId, startedAt: Date.now(), pausedAt: null, totalPausedMs: 0, interval }
  return { startedAt: activeTimer.startedAt }
})

ipcMain.handle('timer:pause', () => {
  if (activeTimer && !activeTimer.pausedAt) activeTimer.pausedAt = Date.now()
})

ipcMain.handle('timer:resume', () => {
  if (activeTimer?.pausedAt) {
    activeTimer.totalPausedMs += Date.now() - activeTimer.pausedAt
    activeTimer.pausedAt = null
  }
})

ipcMain.handle('timer:stop', () => {
  if (!activeTimer) return { elapsed: 0 }
  clearInterval(activeTimer.interval)
  const elapsed = Math.floor(
    (Date.now() - activeTimer.startedAt - activeTimer.totalPausedMs) / 1000
  )
  activeTimer = null
  return { elapsed }
})
```

```typescript
// Renderer — listen to timer ticks pushed from main
window.electron.ipcRenderer.on('timer:tick', (_event, { elapsed }: { elapsed: number }) => {
  setElapsed(elapsed)
  // Update local SQLite duration_seconds every 30s (not every tick — avoids write spam)
})
```

---

## Crash Recovery

```
On app start:
    → Query local_sessions WHERE status IN ('active', 'paused')
    → If found: show recovery dialog
        "TrackSync found an interrupted session for API-123.
         Started at 2:15 PM — recover or discard?"
        [Recover — Keep Time]  [Discard Session]
    → If recover: resume timer from duration_seconds stored in SQLite
    → If discard: mark status = 'discarded'
```

---

## State Management (Zustand Store)

```typescript
interface TimerStore {
  activeSession: LocalSession | null
  elapsed: number // seconds
  status: 'idle' | 'active' | 'paused'
  idleSeconds: number

  startSession: (task: Task) => Promise<void>
  pauseSession: () => void
  resumeSession: () => void
  stopSession: () => void
  discardSession: () => void
}
```

---

## Global Keyboard Shortcuts

> Target audience is developers — keyboard-first workflow is essential.

```typescript
// src/main/shortcuts.ts — Electron main process
// globalShortcut works even when the app window is hidden (system tray mode)
import { globalShortcut, BrowserWindow } from 'electron'

export function registerGlobalShortcuts(): void {
  // Cmd+Shift+T (macOS) / Ctrl+Shift+T (Windows/Linux) — Start or Stop toggle
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('shortcut:toggle_tracking')
    // If window is hidden: show it first
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isVisible()) win.show()
  })

  // Cmd+Shift+P — Pause or Resume toggle
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('shortcut:toggle_pause')
  })

  // Cmd+Shift+M — Open manual time entry
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (!win.isVisible()) win.show()
      win.webContents.send('shortcut:manual_entry')
    }
  })
}

// Unregister on quit to avoid OS conflicts
export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
```

```typescript
// Renderer — listen for shortcut events forwarded from main
window.electron.ipcRenderer.on('shortcut:toggle_tracking', () => toggleTracking())
window.electron.ipcRenderer.on('shortcut:toggle_pause', () => togglePause())
window.electron.ipcRenderer.on('shortcut:manual_entry', () => openManualEntry())
```

| Shortcut           | Action                          |
| ------------------ | ------------------------------- |
| `Cmd/Ctrl+Shift+T` | Start or Stop tracking (toggle) |
| `Cmd/Ctrl+Shift+P` | Pause or Resume (toggle)        |
| `Cmd/Ctrl+Shift+M` | Open manual time entry          |

All shortcuts are user-configurable from Settings → Keyboard Shortcuts.

---

## API Endpoints Used

| Method | Endpoint                         | Purpose                               |
| ------ | -------------------------------- | ------------------------------------- |
| POST   | `/v1/app/sessions/start`         | Create session on server              |
| PATCH  | `/v1/app/sessions/:id/pause`     | Mark paused server-side               |
| PATCH  | `/v1/app/sessions/:id/resume`    | Mark resumed server-side              |
| POST   | `/v1/app/sessions/:id/complete`  | Finalize session on server            |
| GET    | `/v1/app/sessions/check-overlap` | Check for time overlap (manual entry) |
