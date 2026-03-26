# App Module 02 — Settings Sync & Feature Flags

**Platform:** Desktop App (Electron + React)  
**Depends on:** Backend Module 04 (Feature Flags), Backend Module 10 (WebSocket)

---

## Overview

Fetches org-level feature flags from the server, caches them locally, and applies them in real-time via WebSocket. Controls what features are active in the desktop app (screenshots, activity tracking, idle detection, etc.) without requiring a restart.

---

## Settings Fetched from Server

| Setting                         | Default | Controls                         |
| ------------------------------- | ------- | -------------------------------- |
| `screenshots_enabled`           | true    | Screenshot capture module on/off |
| `screenshot_interval`           | 10 min  | How often screenshots fire       |
| `screenshot_blur`               | false   | Blur before display in reports   |
| `screenshot_user_delete_window` | 60s     | Grace period for user to delete  |
| `activity_tracking_enabled`     | true    | Keyboard/mouse/app tracking      |
| `track_keyboard`                | true    | Keyboard event counting          |
| `track_mouse`                   | true    | Mouse click + distance           |
| `track_app_usage`               | true    | Active app name logging          |
| `track_url`                     | false   | Active URL logging               |
| `idle_detection_enabled`        | true    | Idle time detection              |
| `idle_timeout_minutes`          | 5       | Minutes before idle declared     |
| `offline_tracking_enabled`      | true    | Allow fully offline sessions     |
| `force_task_selection`          | true    | Require task before timer starts |

---

## Settings Sync Flow

### On App Launch

```
App starts
    → GET /app/org-settings
    → Response: { ...all settings... }
    → Write to local SQLite settings_cache
    → Apply settings immediately to all modules
    → Start WebSocket connection
```

### Periodic Refresh (Every 5 Minutes)

```
Timer fires every 5 minutes
    → GET /app/org-settings
    → Compare with cached version
    → If changed: apply delta, update cache
    → If request fails: use cached version (no disruption)
```

### Real-Time Push (WebSocket)

```
socket.on('settings:updated', (newSettings) => {
    → Validate payload
    → Merge with current settings
    → Apply immediately to all modules
    → Update local SQLite cache
    → No restart required
})
```

---

## Local Storage (SQLite)

```sql
settings_cache
  key         TEXT PRIMARY KEY
  value       TEXT
  updated_at  INTEGER   -- Unix timestamp
  synced_at   INTEGER
```

Example rows:

```
screenshots_enabled       | true   | ...
screenshot_interval       | 10     | ...
idle_timeout_minutes      | 5      | ...
```

Settings are read from SQLite on every module check — zero API calls at runtime.

---

## Applying Settings to Modules

```typescript
function applySettings(settings: OrgSettings) {
  // Screenshot module
  screenshotModule.setEnabled(settings.screenshots_enabled)
  screenshotModule.setInterval(settings.screenshot_interval * 60 * 1000)

  // Activity module
  activityModule.setEnabled(settings.activity_tracking_enabled)
  activityModule.setTrackKeyboard(settings.track_keyboard)
  activityModule.setTrackMouse(settings.track_mouse)
  activityModule.setTrackApp(settings.track_app_usage)
  activityModule.setTrackUrl(settings.track_url)

  // Idle detection
  idleModule.setEnabled(settings.idle_detection_enabled)
  idleModule.setTimeout(settings.idle_timeout_minutes * 60 * 1000)
}
```

---

## WebSocket Connection Management

```
App launch → connect to wss://api.tracksync.io/ws
    → Authenticate with: { token: <access_token> }
    → Server joins socket to room: org:<org_id>

On disconnect:
    → Auto-reconnect with exponential backoff (2s, 4s, 8s, max 30s)
    → On reconnect: re-fetch full settings (may have changed while offline)

Events received from server:
    settings:updated    → apply new settings
    org:suspended       → lock app, show suspension screen
    session:terminate   → force stop any active session
```

---

## UI Impact Per Setting

| Setting Off                         | What User Sees                                   |
| ----------------------------------- | ------------------------------------------------ |
| `screenshots_enabled = false`       | Screenshot countdown hidden from tracking screen |
| `force_task_selection = false`      | Can start timer without selecting a task         |
| `activity_tracking_enabled = false` | Activity % bar hidden from tracking screen       |
| `offline_tracking_enabled = false`  | Warning shown if internet lost mid-session       |
| `idle_detection_enabled = false`    | No idle popup ever shown                         |

---

## "What TrackSync Sees" — Transparency Screen

> **Legal and trust requirement:** Employees must be able to see exactly what is being collected at any moment. This screen is always accessible from Settings and is shown at first launch (before consent is given).

**Location:** Settings → Privacy → "What is being tracked"  
**Keyboard shortcut:** None (accessed via Settings only — not critical path)

```
┌──────────────────────────────────────────────────────────┐
│  ← Settings     What TrackSync Sees                     │
│                                                          │
│  These settings are controlled by Acme Corp.             │
│                                                          │
│  CURRENTLY COLLECTING:                                   │
│  ─────────────────────────────────────────────────────── │
│  ✅ Session duration (when you start and stop tracking)  │
│  ✅ Task name (what task you are tracking time on)       │
│  ✅ Screenshots every 10 minutes                         │
│       → You can delete each screenshot within 60 seconds │
│       → Visible to your Org Admin and Managers           │
│  ✅ Keyboard event COUNT (number of keypresses per min)  │
│       → NOT what you type — only the count               │
│  ✅ Mouse click count and movement distance (pixels)     │
│  ✅ Active application name (e.g., "VS Code", "Chrome")  │
│                                                          │
│  NOT COLLECTING:                                         │
│  ─────────────────────────────────────────────────────── │
│  ❌ URLs you visit (disabled by your org)                │
│  ❌ What you type (keystroke content never recorded)     │
│  ❌ Screen content reading or OCR                        │
│  ❌ Camera or microphone                                 │
│  ❌ Your location                                        │
│                                                          │
│  DATA VISIBILITY:                                        │
│  ─────────────────────────────────────────────────────── │
│  • Your Org Admin can see: all of the above             │
│  • Your Manager can see: all of the above               │
│  • Your colleagues cannot see your data                  │
│  • You can see your own data in Settings > Privacy       │
│                                                          │
│  Consent given: Mar 4, 2026 — Policy v2.1               │
│  [View full privacy policy]                              │
│  [Manage my data & consent →]                           │
└──────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
function WhatTrackSyncSeesScreen() {
  const settings = useOrgSettings()

  const collecting = [
    { enabled: true, label: 'Session duration (start/stop time, task name)' },
    {
      enabled: settings.screenshots_enabled,
      label: `Screenshots every ${settings.screenshot_interval} minutes`,
      detail: settings.screenshot_user_delete_window > 0
        ? `You can delete within ${settings.screenshot_user_delete_window} seconds`
        : 'No delete window'
    },
    { enabled: settings.track_keyboard, label: 'Keyboard event count (not content)' },
    { enabled: settings.track_mouse, label: 'Mouse click count + movement distance' },
    { enabled: settings.track_app_usage, label: 'Active application name' },
    { enabled: settings.track_url, label: 'URLs visited in browser' },
  ]

  return (
    <SettingsPage title="What TrackSync Sees">
      {collecting.map(item => (
        <TrackingItem
          key={item.label}
          enabled={item.enabled}
          label={item.label}
          detail={item.detail}
        />
      ))}
      <ConsentHistory />
      <Link to="/settings/privacy">Manage my data & consent →</Link>
    </SettingsPage>
  )
}
```

---

## API Endpoints Used

| Method | Endpoint            | Purpose                 |
| ------ | ------------------- | ----------------------- |
| GET    | `/app/org-settings` | Fetch full org settings |
| WS     | `wss://.../ws`      | Real-time settings push |
