# App Module 09 — System Tray & Notifications

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 04 (Time Tracking), App Module 07 (Sync Engine)

---

## Overview

The system tray icon provides quick access to the app without keeping a window open. Notifications alert users to important events (screenshot taken, idle detected, session reminders, sync issues). The app can run entirely from the tray with the main window hidden.

---

## System Tray Icon

### Icon States

| State | Icon Appearance |
|-------|----------------|
| Idle (no session) | Grey clock icon |
| Actively tracking | Pulsing red dot + clock |
| Paused | Yellow pause symbol |
| Offline | Grey with wifi-off badge |
| Syncing | Animated sync icon |
| Error / needs attention | Red exclamation badge |

### Tray Menu (Right-click)

```
┌─────────────────────────────────┐
│  TrackSync                      │
│  ─────────────────────────────  │
│  ● TRACKING: API-123 — 01:23:45 │  ← live if session active
│  [Stop & Log]                   │
│  ─────────────────────────────  │
│  Show Window                    │
│  ─────────────────────────────  │
│  Sync Status: ✅ All synced     │
│  ─────────────────────────────  │
│  Settings                       │
│  Quit TrackSync                 │
└─────────────────────────────────┘
```

When no session active:
```
┌─────────────────────────────────┐
│  TrackSync                      │
│  ─────────────────────────────  │
│  ⏸ No active session           │
│  [Start Tracking]               │
│  ─────────────────────────────  │
│  Show Window                    │
│  Sync Status: ✅ All synced     │
│  Settings                       │
│  Quit TrackSync                 │
└─────────────────────────────────┘
```

---

## Window Management

- Main window can be hidden (not closed) — app continues running in tray
- Closing the window minimizes to tray (not quit)
- Double-click tray icon → show/focus main window
- "Quit TrackSync" from menu → stops active session (with confirm dialog if session active) → quits app

---

## Notifications

### Screenshot Taken
```
Type: toast (bottom-right)
Duration: screenshot_user_delete_window seconds (then auto-dismiss)
Content:
    📸 Screenshot taken
    [Delete (0:60)] ← countdown if delete window active
```

### Idle Detected
```
Type: modal popup (requires interaction)
Content:
    You've been idle for 5 minutes.
    What would you like to do?
    [Keep all time]  [Discard idle time]
```

### Session Reminder (optional, future)
```
If user hasn't started a session by 9:30 AM:
    Type: OS notification
    Content: "Don't forget to log your work — start tracking in TrackSync"
```

### Sync Failed
```
Type: tray badge + optional toast
Content: "Sync failed — 3 items couldn't be uploaded. [View Details]"
```

### Org Suspended
```
Type: modal (blocks app)
Content:
    ⚠️ Account Suspended
    Your organization's access has been suspended.
    Reason: [suspension_reason from server]
    Please contact your admin or billing team.
    [Open Billing Portal]
```

### Session Force-Terminated (WebSocket push)
```
Type: modal
Content:
    Session terminated by admin.
    Your session has been saved locally and will sync when access is restored.
```

---

## Auto-Start on Login

| Platform | Method |
|----------|--------|
| macOS | LaunchAgents plist in ~/Library/LaunchAgents/ |
| Windows | Registry key: HKCU\Software\Microsoft\Windows\CurrentVersion\Run |
| Linux | ~/.config/autostart/tracksync.desktop |

Configurable in app Settings → General → "Launch TrackSync at login" toggle.

---

## Electron Implementation

```typescript
// src/main/tray.ts — Electron main process
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import path from 'path'

let tray: Tray | null = null

export function setupTray(): void {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../assets/tray-icon.png')
  )
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('TrackSync')
  tray.setContextMenu(buildTrayMenu(null))

  // Left-click: toggle main window
  tray.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isVisible()) { win.hide() } else { win?.show() }
  })
}

// Update tray menu — called via ipcMain when session state changes
export function updateTrayMenu(session: TraySessionInfo | null): void {
  tray?.setContextMenu(buildTrayMenu(session))
}

function buildTrayMenu(session: TraySessionInfo | null): Menu {
  return Menu.buildFromTemplate([
    session
      ? { label: `🔴 ${session.taskName} — ${formatDuration(session.elapsedSeconds)}`, enabled: false }
      : { label: 'Not tracking', enabled: false },
    { type: 'separator' },
    { label: session ? 'Stop & Log' : 'Start Tracking', click: () =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('tray:toggle_tracking') },
    { label: 'Add Manual Time', click: () =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('shortcut:manual_entry') },
    { type: 'separator' },
    { label: 'Open TrackSync', click: () => BrowserWindow.getAllWindows()[0]?.show() },
    { label: 'Quit', click: () => app.quit() },
  ])
}
```

```typescript
// ipcMain handler — renderer calls this to update the tray menu
ipcMain.on('tray:update_session', (_event, session) => {
  updateTrayMenu(session)
})
```

---

## Platform-Specific Notification APIs

| Platform | API Used |
|----------|---------|
| macOS | `new Notification()` (Electron built-in → UNUserNotification) |
| Windows | `new Notification()` (Electron built-in → Windows Toast) |
| Linux | `new Notification()` (Electron built-in → libnotify) |

Electron's built-in `Notification` class (from `electron` package, main process) wraps all three platforms natively.
