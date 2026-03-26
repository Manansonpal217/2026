# App Module 10 — Cross-Platform Permissions & Auto-Updates

**Platform:** Desktop App (Electron + React)  
**Depends on:** App Module 01 (Auth/Onboarding), App Module 02 (Settings Sync)

---

## Overview

Handles platform-specific permission flows (especially macOS screen recording + accessibility), OS keychain credential storage via `keytar`, and silent auto-updates using `electron-updater`.

---

## Platform Support Matrix

| Platform              | Version       | Arch   | Status  |
| --------------------- | ------------- | ------ | ------- |
| macOS (Apple Silicon) | 12.0+         | arm64  | ✅ Full |
| macOS (Intel)         | 10.15+        | x86_64 | ✅ Full |
| Windows               | 10/11         | x64    | ✅ Full |
| Windows               | 10/11         | ARM64  | ✅ Full |
| Linux                 | Ubuntu 20.04+ | x86_64 | ✅ Full |
| Linux                 | Fedora 35+    | x86_64 | ✅ Full |

---

## Permission: Screen Recording (macOS)

```
Required for: Screenshot capture (Module 05)
API: CGWindowListCreateImage — requires TCC permission

Flow:
1. App detects: platform = macOS AND screenshots_enabled = true
2. Check current permission: `ipcRenderer.invoke('permissions:checkScreenRecording')`
3. If not granted: show in-app permission guide screen
   ┌──────────────────────────────────────────────────┐
   │  📸 Screen Recording Permission Required         │
   │                                                  │
   │  TrackSync needs access to capture screenshots   │
   │  as required by your organization.               │
   │                                                  │
   │  1. Click "Open System Settings" below           │
   │  2. Go to Privacy & Security → Screen Recording  │
   │  3. Toggle TrackSync ON                          │
   │                                                  │
   │  [Open System Settings]   [I'll do this later]   │
   └──────────────────────────────────────────────────┘
4. Poll for permission every 2 seconds (max 120 seconds)
5. On grant: close guide, screenshot module activates

If screenshots_enabled = false:
    → Skip this permission request entirely
    → Never ask the user
```

---

## Permission: Accessibility (macOS/Linux)

```
Required for: Keyboard + mouse event counting (Module 06)
API: CGEventTap (macOS), /proc/bus/input/devices (Linux)

Flow:
1. Check if activity_tracking_enabled = true
2. Check accessibility permission
3. If not granted: show guide
   (same pattern as screen recording — separate guide screen)
4. macOS: Open System Settings → Privacy → Accessibility → toggle TrackSync
5. Linux: may require running with elevated access or udev rules
6. On grant: activity module activates
```

---

## Secure Token Storage (OS Keychain)

| Platform | Keychain API                         | What's Stored                              |
| -------- | ------------------------------------ | ------------------------------------------ |
| macOS    | Keychain Services                    | access_token, refresh_token, desktop_token |
| Windows  | Windows DPAPI / Credential Manager   | Same                                       |
| Linux    | Secret Service (libsecret) / KWallet | Same                                       |

```typescript
// src/main/auth/keychain.ts — keytar wraps all three platforms
import keytar from 'keytar'

const SERVICE = 'TrackSync'

export const keychain = {
  set: (key: string, value: string) => keytar.setPassword(SERVICE, key, value),
  get: (key: string) => keytar.getPassword(SERVICE, key),
  delete: (key: string) => keytar.deletePassword(SERVICE, key),
}

// Usage:
await keychain.set('access_token', token)
const token = await keychain.get('access_token')
await keychain.delete('access_token')
```

Tokens are NEVER stored in:

- Local SQLite
- File system
- localStorage / sessionStorage
- Environment variables

---

## Auto-Start at Login

```typescript
// src/main/autostart.ts
// npm: electron-auto-launch
import AutoLaunch from 'electron-auto-launch'

const autoLauncher = new AutoLaunch({
  name: 'TrackSync',
  isHidden: true, // start minimized to tray
})

export const autostart = {
  enable: () => autoLauncher.enable(),
  disable: () => autoLauncher.disable(),
  isEnabled: () => autoLauncher.isEnabled(),
}
```

User-controlled via Settings → General → "Launch at login" toggle.

---

## Auto-Updates (Silent Background Update)

```
Update check flow:
    → On app launch + every 4 hours
    → electron-updater checks S3 (or GitHub Releases) for latest.yml
       Response: { version, path, sha512, releaseDate }
    → Compare with current app.getVersion()
    → If newer:
        → Download in background (progress events emitted)
        → Verify sha512 checksum + code signature
        → Prompt user: "Update available (v1.2.3). Install now or on next launch?"
        → [Install Now (Restart)] [Later]
        → If Later: installs on next app quit
```

```typescript
// src/main/updater.ts
// npm: electron-updater (part of electron-builder ecosystem)
import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:progress', progress.percent)
  })

  autoUpdater.on('update-downloaded', (info) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:ready', info)
    // User clicks "Install Now" → renderer calls:
    // ipcRenderer.invoke('updater:install')
  })

  // Check on startup
  autoUpdater.checkForUpdatesAndNotify()
}
```

Release server: S3 bucket (`tracksync-releases`) — `electron-builder` uploads `latest.yml` + installer on each release CI run.

---

## Platform-Specific Feature Matrix

| Feature            | macOS               | Windows                  | Linux            |
| ------------------ | ------------------- | ------------------------ | ---------------- |
| Screenshot capture | ✅ (TCC permission) | ✅ (no prompt)           | ✅ (X11/Wayland) |
| Keyboard counting  | ✅ (Accessibility)  | ✅                       | ✅               |
| Mouse counting     | ✅                  | ✅                       | ✅               |
| Active app name    | ✅ (NSWorkspace)    | ✅ (GetForegroundWindow) | ✅ (X11)         |
| Active URL         | ✅ (Accessibility)  | ✅ (UIAutomation)        | ⚠️ Limited       |
| Keychain storage   | ✅ (Keychain)       | ✅ (DPAPI)               | ✅ (libsecret)   |
| Auto-start         | ✅ (LaunchAgent)    | ✅ (Registry)            | ✅ (.desktop)    |
| Auto-update        | ✅                  | ✅                       | ✅               |
| System tray        | ✅ (Menu bar)       | ✅ (System tray)         | ✅               |

---

## Code Signing & Notarization

> **Why mandatory:** Unsigned apps are blocked by macOS Gatekeeper and trigger SmartScreen warnings on Windows. This destroys first impressions and prevents installs in corporate IT environments.

**Tool:** `electron-builder` handles all packaging and signing.

### `electron-builder.yml` — Build Config

```yaml
# electron-builder.yml
appId: io.tracksync.app
productName: TrackSync
copyright: Copyright © 2026 TrackSync

directories:
  output: dist

files:
  - dist-react/**/*
  - src/main/**/*
  - node_modules/**/*

mac:
  target:
    - target: dmg
      arch: [x64, arm64] # Intel + Apple Silicon universal
  category: public.app-category.productivity
  hardenedRuntime: true # required for notarization
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

win:
  target:
    - target: nsis
      arch: [x64]
  signingHashAlgorithms: [sha256]
  timeStampServer: http://timestamp.digicert.com

linux:
  target: [AppImage, deb]
  category: Utility

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

publish:
  provider: s3
  bucket: tracksync-releases
  region: us-east-1
```

### macOS — Apple Developer ID + Notarization

```yaml
# Required secrets in GitHub repo:
# APPLE_CERTIFICATE_BASE64        ← Developer ID Application cert (.p12 base64)
# APPLE_CERTIFICATE_PASSWORD      ← .p12 password
# APPLE_ID                        ← Apple ID email
# APPLE_APP_SPECIFIC_PASSWORD     ← App-specific password for notarytool
# APPLE_TEAM_ID                   ← Apple Team ID

- name: Import macOS signing certificate
  run: |
    echo "$APPLE_CERTIFICATE_BASE64" | base64 --decode > certificate.p12
    security create-keychain -p "" build.keychain
    security import certificate.p12 -k build.keychain \
      -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: -s -k "" build.keychain
    security default-keychain -s build.keychain

- name: Build & notarize macOS
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    CSC_LINK: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
    CSC_KEY_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  run: npx electron-builder --mac --publish never
```

`electron-builder` automatically runs `notarytool` after codesigning and staples the notarization ticket to the `.dmg`.

### Windows — Authenticode (EV Code Signing)

```yaml
# Required secrets:
# WIN_CSC_LINK              ← EV cert (.pfx base64-encoded)
# WIN_CSC_KEY_PASSWORD      ← .pfx password

- name: Build & sign Windows
  env:
    WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
  run: npx electron-builder --win --publish never
```

`electron-builder` calls `signtool.exe` automatically to sign both the `.exe` installer and the app `.exe` inside.

> **Certificate requirement:** Use an EV (Extended Validation) certificate for immediate SmartScreen trust. OV certificates require reputation building over time.

### Linux — AppImage / deb (No signing, but checksum published)

Publish SHA256 checksums in GitHub Release notes for user verification.

---

## Build Pipeline (GitHub Actions)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    strategy:
      matrix:
        include:
          - os: macos-13 # Intel Mac (also builds arm64 via arch target)
            platform: mac
          - os: windows-latest
            platform: win
          - os: ubuntu-22.04
            platform: linux

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Build Electron app
        env:
          # macOS
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          # Windows
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
          # Auto-update signing key
          EP_PRE_RELEASE: false
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: npx electron-builder --${{ matrix.platform }} --publish always
```

Produces:

- `TrackSync-1.0.0.dmg` (macOS — notarized + Gatekeeper approved, Universal binary)
- `TrackSync-Setup-1.0.0.exe` (Windows — Authenticode signed NSIS installer)
- `TrackSync-1.0.0.AppImage` + `tracksync_1.0.0_amd64.deb` (Linux)
