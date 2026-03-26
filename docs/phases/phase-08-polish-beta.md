# Phase 8 — Polish, Beta & Manual Time Entry (Week 25–27)

## Goal

The product is ready for a closed beta with real customers. This phase completes remaining UX gaps: manual time entry, dark mode, global keyboard shortcuts, auto-update, code signing (macOS notarization + Windows Authenticode), and the full self-serve signup onboarding wizard. Performance profiling is done. The first 10 beta customers are onboarded.

---

## Prerequisites

- Phases 0–7 complete and deployed to staging
- Apple Developer Program membership + notarization credentials
- Windows code signing certificate (DigiCert or similar)
- S3 bucket for auto-update artifacts: `tracksync-releases-{env}`
- `electron-updater` feed URL configured

---

## Key Packages to Install

### Desktop

```bash
pnpm add electron-updater electron-log
pnpm add electron-auto-launch
pnpm add -D electron-notarize     # Apple notarization
```

### Backend

```bash
pnpm add nodemailer               # (if not already) for onboarding emails
```

### Web

```bash
pnpm add next-themes              # Dark mode for Next.js
pnpm add framer-motion            # Smooth page transitions / onboarding wizard
pnpm add react-confetti           # Onboarding completion celebration
```

---

## Database Migrations

```prisma
// Extend TimeSession with manual entry support (approval_status already exists)
// Add to User:
//   onboarding_completed Boolean @default(false)
//   onboarding_step      Int     @default(0)

// Add to Organization:
//   onboarding_completed Boolean @default(false)
```

Run:

```bash
pnpm prisma migrate dev --name phase-08-polish-beta
```

---

## Files to Create

| File                                                 | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| `src/routes/sessions/manual.ts`                      | `POST /v1/sessions/manual`                       |
| `src/routes/onboarding/index.ts`                     | `GET/PATCH /v1/onboarding/status`                |
| Desktop: `src/main/updater.ts`                       | `electron-updater` setup                         |
| Desktop: `src/main/shortcuts.ts`                     | Global keyboard shortcuts                        |
| Desktop: `src/renderer/pages/ManualEntry.tsx`        | Manual time entry form                           |
| Desktop: `src/renderer/pages/Settings.tsx`           | App settings (shortcuts, auto-launch, dark mode) |
| Desktop: `src/renderer/components/ThemeProvider.tsx` | Dark mode system-preference detection            |
| Web: `app/(auth)/signup/page.tsx`                    | Self-serve signup                                |
| Web: `app/(auth)/onboarding/page.tsx`                | 5-step onboarding wizard                         |
| Web: `components/ThemeProvider.tsx`                  | `next-themes` wrapper                            |
| Web: `components/ui/OnboardingWizard.tsx`            | Wizard component with progress steps             |
| `electron-builder.yml`                               | Updated with notarization + signing config       |
| `.github/workflows/release.yml`                      | Updated with signing secrets                     |

---

## Backend Tasks

### Manual Time Entry API

- [ ] `POST /v1/sessions/manual`

  ```
  Request:
  {
    project_id?: string,
    task_id?: string,
    started_at: string,   // ISO 8601
    ended_at: string,     // ISO 8601
    notes?: string
  }

  Response: { session }
  ```

  - Validate: `ended_at > started_at`
  - Validate: `duration_sec <= 24 * 3600` (max 24 hours per entry)
  - Validate: `started_at` not in the future
  - Validate: no overlap with existing sessions for this user on this day (query `TimeSession` with `started_at` range)
  - Set `is_manual = true`, `approval_status = 'pending'` (always requires approval for manual entries)
  - Return overlap error if conflict detected: `{ error: 'OVERLAP', conflicting_session_id }`

### Onboarding Wizard API

- [ ] `GET /v1/onboarding/status`

  ```
  Response: { step: 0–5, completed: boolean, checklist: { ... } }
  ```

- [ ] `PATCH /v1/onboarding/step`
  ```
  Request:  { step: number }
  Response: { step, completed }
  ```

**Onboarding steps:**
| Step | Title | Action |
|------|-------|--------|
| 0 | Verify email | Email verification sent in signup |
| 1 | Complete your profile | Name, timezone |
| 2 | Invite your team | Invite at least 1 member |
| 3 | Connect an integration | Optional (Jira/Asana) |
| 4 | Download the Desktop App | Link to installer |
| 5 | Start tracking time | First session synced |

### Self-Serve Signup API (enhance from Phase 1)

- [ ] Add disposable email domain block list (download list or use `disposable-email-domains` npm package)
- [ ] Block `gmail.com`, `yahoo.com`, `hotmail.com` etc. for B2B-only signup
- [ ] After signup, trigger onboarding email sequence (3 emails over 3 days):
  - Day 0: Welcome + verify email
  - Day 1: "Invite your team" reminder
  - Day 3: "Connect your first integration"

---

## Desktop App Tasks

### Manual Time Entry (`src/renderer/pages/ManualEntry.tsx`)

- [ ] Form fields:
  - Date picker (defaulting to today)
  - Start time picker (`HH:MM`)
  - End time picker (`HH:MM`)
  - Duration display (auto-calculated: `end - start`)
  - Project picker
  - Task picker
  - Notes text area
- [ ] Inline validation:
  - End must be after start
  - Max 24-hour duration warning
  - Overlap warning (call `GET /v1/sessions` to check for conflicts before submitting)
- [ ] Submit → `POST /v1/sessions/manual`
- [ ] Show "Pending approval" badge in today's session list after submission

### Global Keyboard Shortcuts (`src/main/shortcuts.ts`)

```typescript
import { globalShortcut } from 'electron'

export function registerShortcuts(mainWindow: BrowserWindow): void {
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    mainWindow.webContents.send('shortcut:toggle-timer')
  })
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
```

Renderer listens for `shortcut:toggle-timer` and calls `timer:start` or `timer:stop` accordingly.

### Auto-Update (`src/main/updater.ts`)

```typescript
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.checkForUpdatesAndNotify()

autoUpdater.on('update-available', () => {
  new Notification({ title: 'TrackSync', body: 'Update available. Downloading...' }).show()
})

autoUpdater.on('update-downloaded', () => {
  new Notification({ title: 'TrackSync', body: 'Update ready. Restart to install.' }).show()
})
```

- [ ] `autoUpdater.checkForUpdatesAndNotify()` on app startup (after 5s delay)
- [ ] Check again every 4 hours via `setInterval`

### Code Signing (`electron-builder.yml`)

```yaml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: ${APPLE_TEAM_ID}

win:
  certificateSubjectName: TrackSync Inc
  signingHashAlgorithms: [sha256]
  rfc3161TimeStampServer: http://timestamp.digicert.com

linux:
  target:
    - target: AppImage
    - target: deb
```

**GitHub Actions secrets required:**

- `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`
- `CSC_LINK` (Windows .pfx as base64), `CSC_KEY_PASSWORD`

### Auto-Launch (`src/main/index.ts`)

```typescript
import AutoLaunch from 'electron-auto-launch'
const autoLaunch = new AutoLaunch({ name: 'TrackSync', isHidden: true })
// Toggle in settings: autoLaunch.enable() / autoLaunch.disable()
```

### Dark Mode (`src/renderer/components/ThemeProvider.tsx`)

```typescript
import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = (resolved: 'light' | 'dark') => {
      root.classList.toggle('dark', resolved === 'dark')
    }
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'dark' : 'light')
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    applyTheme(theme)
  }, [theme])

  return <>{children}</>
}
```

- [ ] Zustand `themeStore`: `theme: 'light' | 'dark' | 'system'`, persisted to `localStorage`
- [ ] Settings page: theme selector with three options

### System Tray Enhancement (`src/main/tray.ts`)

- [ ] Show current timer elapsed time in tray tooltip: "TrackSync — Running: 1h 23m"
- [ ] Tray context menu:
  - If timer running: "Stop Timer (Cmd+Shift+S)"
  - If timer stopped: "Start Timer"
  - Separator
  - "Show App"
  - "Manual Entry"
  - "Quit"

---

## Web Admin Panel Tasks

### Self-Serve Signup (`app/(auth)/signup/page.tsx`)

- [ ] Fields: Company name, slug (auto-suggested from company name), Full name, Work email, Password, Data region selector
- [ ] Real-time slug availability check (debounced `GET /v1/auth/check-slug?slug=`)
- [ ] "Why work email?" tooltip explaining the B2B policy
- [ ] On submit: `POST /v1/auth/signup` → redirect to email verification waiting screen

### Onboarding Wizard (`app/(auth)/onboarding/page.tsx`)

- [ ] 5-step wizard with progress bar at top
- [ ] Each step has: title, description, primary action, "Skip" link (except step 0)
- [ ] Step 5 completion: confetti animation (`react-confetti`) + "Go to Dashboard" button
- [ ] Persist progress: `PATCH /v1/onboarding/step` after each completed step
- [ ] Show wizard again on dashboard if `onboarding_completed = false` via banner

### Dark Mode (`app/layout.tsx`)

```typescript
// app/layout.tsx
import { ThemeProvider } from 'next-themes'
export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] Dark mode toggle in navbar (light / dark / system)
- [ ] All shadcn/ui components use `dark:` CSS class variants — verify every page in dark mode

---

## Performance Profiling Checklist

Before beta launch, profile these areas:

- [ ] Backend: `GET /v1/reports/time` with 10,000 sessions — target < 500ms (use EXPLAIN ANALYZE)
- [ ] Backend: `POST /v1/sessions/batch` with 50 sessions — target < 200ms
- [ ] Desktop: Timer tick does not cause > 16ms render (check Electron profiler)
- [ ] Desktop: SQLite write on `stopTimer` — target < 5ms
- [ ] Desktop: Screenshot capture + encrypt — target < 2s
- [ ] Web: Lighthouse score > 90 on dashboard page
- [ ] Web: Time to Interactive < 3s on cold load

---

## Definition of Done

1. Manual time entry form validates overlaps and posts session with `is_manual: true`
2. `Cmd+Shift+S` / `Ctrl+Shift+S` starts/stops timer globally — works when app window is hidden
3. App auto-updates: staging build → push new tag → app detects update and notifies user
4. macOS build passes notarization: `spctl --assess --type exec TrackSync.app` returns `accepted`
5. Windows build is signed: Security Properties shows "TrackSync Inc" as publisher
6. Self-serve signup: new org created, verification email sent, onboarding wizard shows on first login
7. Dark mode: all pages render correctly in dark mode, no white flash on load
8. Beta customer onboarding: 10 real customers tracking time in production

---

## Testing Checklist

| Test                                                | Type        | Tool                           |
| --------------------------------------------------- | ----------- | ------------------------------ |
| Manual entry rejects overlapping sessions           | Integration | Vitest                         |
| Manual entry validates end > start                  | Unit        | Vitest                         |
| Manual entry creates session with `is_manual: true` | Integration | Vitest                         |
| Global shortcut toggles timer                       | E2E         | Playwright (Electron)          |
| Auto-update check fires on startup                  | Unit        | Vitest + electron-updater mock |
| Signup blocks disposable email domains              | Unit        | Vitest                         |
| Onboarding step progression                         | Integration | Vitest                         |
| Dark mode persists across app restarts              | E2E         | Playwright                     |
| macOS notarization                                  | Manual      | Archive → Notarize in CI       |
| Windows signing                                     | Manual      | Build + check properties       |
| Lighthouse performance score                        | Manual      | Chrome DevTools                |
