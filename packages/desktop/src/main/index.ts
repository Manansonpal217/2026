import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  powerMonitor,
  systemPreferences,
} from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { authHandlers, ensureValidSession } from './auth/handlers.js'
import { openDb, closeDb } from './db/index.js'
import {
  startTimer,
  stopTimer,
  switchTask,
  getTimerStatus,
  getTodaySessions,
  getDeviceId,
  setTimerWindowRef,
  getActiveSessionContext,
  type SessionContext,
} from './timer/index.js'
import { startSyncScheduler, stopSyncScheduler, triggerImmediateSync } from './sync/scheduler.js'
import { getPendingSyncCount } from './sync/sessionSync.js'
import { startScreenshotScheduler, stopScreenshotScheduler } from './screenshot/scheduler.js'
import { syncRunningSessionToBackend } from './sync/sessionSync.js'
import { startWindowBuffer, stopWindowBuffer } from './activity/windowBuffer.js'
import {
  startInputMonitor,
  stopInputMonitor,
  isInputMonitorAvailable,
} from './activity/inputMonitor.js'
import { getActivityPercentForTrackedTime, pruneOldIntervals } from './activity/intervalTracker.js'
import { startActiveWindowPolling, stopActiveWindowPolling } from './activity/activeWin.js'
import { startIdleManager, stopIdleManager, type StopReason } from './idle/idleManager.js'
import { getDb } from './db/index.js'
import { computeStreakFromLocalSessions } from './streak.js'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// In-memory project cache: { orgId -> { projects, fetchedAt } }
const projectCache = new Map<string, { projects: unknown[]; fetchedAt: number }>()
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Auto-stop/restart state (idle manager)
let savedAutoStopContext: SessionContext | null = null
let isAutoRestarting = false
let resumePollIntervalId: ReturnType<typeof setInterval> | null = null

const ACTIVITY_THRESHOLD_SEC = 5
const RESUME_POLL_MS = 2000

function clearResumePolling(): void {
  if (resumePollIntervalId) {
    clearInterval(resumePollIntervalId)
    resumePollIntervalId = null
  }
}

let mainWindow: BrowserWindow | null = null

// Store notification refs to prevent GC (Electron notifications can be collected before showing)
const notificationRefs: Notification[] = []

function clearNotification(notif: Notification): void {
  const i = notificationRefs.indexOf(notif)
  if (i >= 0) notificationRefs.splice(i, 1)
}

async function fetchOrgSettings(): Promise<{
  idle_timeout_minutes?: number
  idle_timeout_intervals?: number
  idle_detection_enabled?: boolean
  screenshot_interval_seconds?: number
} | null> {
  const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
  if (!token) return null
  try {
    const res = await fetch(`${API_URL}/v1/app/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      org_settings?: {
        idle_timeout_minutes?: number
        idle_timeout_intervals?: number
        idle_detection_enabled?: boolean
        screenshot_interval_seconds?: number
      }
    }
    return data.org_settings ?? null
  } catch {
    return null
  }
}

function showTrackingStoppedNotification(reason: StopReason): void {
  if (!Notification.isSupported()) {
    console.warn('[idleManager] Notifications not supported — cannot show tracking stopped')
    return
  }
  const reasonText =
    reason === 'inactivity' ? 'Inactivity' : reason === 'sleep' ? 'System sleep' : 'Screen locked'
  const notif = new Notification({
    title: 'TrackSync',
    body: `Tracking stopped — ${reasonText}`,
    silent: false,
  })
  notificationRefs.push(notif)
  notif.on('close', () => clearNotification(notif))
  notif.on('click', () => clearNotification(notif))
  notif.show()
  if (process.platform === 'darwin') app.dock?.bounce('informational')
}

function showTrackingStartedNotification(): void {
  if (!Notification.isSupported()) {
    console.warn('[idleManager] Notifications not supported — cannot show tracking started')
    return
  }
  const notif = new Notification({
    title: 'TrackSync',
    body: 'Tracking started',
    silent: false,
  })
  notificationRefs.push(notif)
  notif.on('close', () => clearNotification(notif))
  notif.on('click', () => clearNotification(notif))
  notif.show()
}

function handleAutoStop(reason: StopReason): void {
  const context = getActiveSessionContext()
  if (!context) return

  stopScreenshotScheduler()
  stopWindowBuffer()
  stopActiveWindowPolling()
  stopTimer()
  savedAutoStopContext = context

  clearResumePolling()

  let pollCount = 0
  function checkIdleAndRestart(): void {
    if (!savedAutoStopContext || isAutoRestarting) return
    try {
      const idleSec = powerMonitor.getSystemIdleTime()
      const state = powerMonitor.getSystemIdleState(ACTIVITY_THRESHOLD_SEC)
      pollCount++
      if (pollCount <= 3 || pollCount % 5 === 0) {
        console.log('[idleManager] Resume poll #' + pollCount + ':', { idleSec, state })
      }
      if (idleSec < ACTIVITY_THRESHOLD_SEC || state === 'active') {
        console.log('[idleManager] Activity detected via powerMonitor:', { idleSec, state })
        clearResumePolling()
        performAutoRestart()
      }
    } catch (err) {
      console.warn('[idleManager] Resume poll error:', err)
    }
  }

  console.log('[idleManager] Starting resume poll')
  checkIdleAndRestart() // Check immediately
  resumePollIntervalId = setInterval(checkIdleAndRestart, RESUME_POLL_MS)

  showTrackingStoppedNotification(reason)
  if (!isInputMonitorAvailable()) {
    console.warn(
      '[idleManager] Input monitor unavailable — auto-restart on activity will not work. On macOS, add TrackSync to System Preferences > Privacy & Security > Accessibility.'
    )
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'TrackSync',
        body: 'Tracking stopped. Click this app to restart, or enable Accessibility for auto-restart.',
        silent: false,
      })
      notificationRefs.push(notif)
      notif.on('close', () => clearNotification(notif))
      notif.on('click', () => clearNotification(notif))
      notif.show()
    }
  }
  triggerImmediateSync()
  // Do NOT stop inputMonitor — needed to detect return
}

async function performAutoRestart(): Promise<void> {
  if (!savedAutoStopContext || isAutoRestarting) return
  console.log('[idleManager] Performing auto-restart')
  isAutoRestarting = true
  try {
    const token = await ensureValidSession(mainWindow ?? undefined)
    if (!token) {
      console.warn('[idleManager] Auto-restart failed: not authenticated')
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'TrackSync',
          body: 'Could not auto-restart — please start manually.',
          silent: false,
        })
        notificationRefs.push(notif)
        notif.on('close', () => clearNotification(notif))
        notif.on('click', () => clearNotification(notif))
        notif.show()
      }
      return
    }
    const payload = JSON.parse(atob(token.split('.')[1])) as { sub: string; org_id: string }
    const deviceId = getDeviceId()
    const deviceName = `${app.getName()} on ${process.platform}`

    const result = startTimer({
      userId: payload.sub,
      orgId: payload.org_id,
      deviceId,
      deviceName,
      projectId: savedAutoStopContext.projectId,
      taskId: savedAutoStopContext.taskId,
      notes: savedAutoStopContext.notes,
    })

    savedAutoStopContext = null
    showTrackingStartedNotification()

    const sessionId = (result as { session?: { id: string } }).session?.id
    if (sessionId) {
      syncRunningSessionToBackend(sessionId).catch(() => {})
      const orgSettings = await fetchOrgSettings()
      const screenshotIntervalSec = orgSettings?.screenshot_interval_seconds ?? 60
      console.log(
        '[timer] Screenshot interval from org (auto-restart):',
        screenshotIntervalSec,
        's'
      )
      startScreenshotScheduler(sessionId, screenshotIntervalSec, (takenAt) => {
        mainWindow?.webContents.send('screenshot:captured', { taken_at: takenAt })
      })
      startWindowBuffer(sessionId)
      // inputMonitor is already running — do NOT call startInputMonitor
      startActiveWindowPolling()
    }

    mainWindow?.webContents.send('timer:started', {
      elapsed: 0,
      session: (result as { session?: unknown }).session,
    })
  } catch (err) {
    console.warn('[idleManager] Auto-restart failed:', err)
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'TrackSync',
        body: 'Could not auto-restart — please start manually.',
        silent: false,
      })
      notificationRefs.push(notif)
      notif.on('close', () => clearNotification(notif))
      notif.on('click', () => clearNotification(notif))
      notif.show()
    }
  } finally {
    isAutoRestarting = false
    clearResumePolling()
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 580,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#050508', // Match dark theme; updated via IPC when theme changes
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
  })

  mainWindow.setTitle('Work Log')

  const isDev = !app.isPackaged
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'

  if (isDev) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Debug: log load failures (helps diagnose blank screen)
  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.error('[Electron] Failed to load:', { code, desc, url })
  })

  // Sync on window focus; also trigger auto-restart when user returns to app
  mainWindow.on('focus', () => {
    triggerImmediateSync()
    if (savedAutoStopContext && !isAutoRestarting) {
      console.log('[idleManager] Window focused, triggering auto-restart')
      performAutoRestart()
    } else if (savedAutoStopContext) {
      console.log('[idleManager] Window focused but skip restart:', { isAutoRestarting })
    }
  })
}

app.whenReady().then(async () => {
  // Open SQLite database (async — must await before registering handlers that use DB)
  await openDb()

  // Prune old activity intervals (keep only today)
  pruneOldIntervals()

  // Register auth IPC handlers
  authHandlers(
    ipcMain,
    () => mainWindow,
    () => projectCache.clear()
  )

  // Theme: sync window background with app theme (hides title bar seam in light mode)
  ipcMain.handle('theme:set-background', (_e, theme: 'light' | 'dark') => {
    const color = theme === 'light' ? '#f8fafc' : '#050508'
    mainWindow?.setBackgroundColor(color)
  })

  // Register timer IPC handlers (must run before createWindow so handlers are ready)
  setTimerWindowRef(() => mainWindow)
  registerTimerHandlers()
  registerProjectHandlers()

  createWindow()

  startSyncScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopIdleManager()
  clearResumePolling()
  savedAutoStopContext = null
  stopScreenshotScheduler()
  stopWindowBuffer()
  stopInputMonitor()
  stopActiveWindowPolling()
  stopTimer()
  stopSyncScheduler()
  closeDb()
})

// ── Onboarding state (persisted in app userData) ──────────────────────────────

function getOnboardingStore() {
  const storePath = join(app.getPath('userData'), 'onboarding.json')
  return {
    isDone: () => existsSync(storePath),
    markDone: () =>
      writeFileSync(storePath, JSON.stringify({ done: true, ts: Date.now() }), 'utf-8'),
    read: () => {
      try {
        return JSON.parse(readFileSync(storePath, 'utf-8'))
      } catch {
        return null
      }
    },
  }
}

// ── Timer IPC Handlers ────────────────────────────────────────────────────────

function registerTimerHandlers(): void {
  // auth:check — compatibility alias (used by renderer App.tsx)
  // Fetches user from /me so we get name/email for avatar (JWT only has sub, org_id, role)
  ipcMain.handle('auth:check', async () => {
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (!token) return { authenticated: false, user: null }
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as {
        sub: string
        org_id: string
        role: string
      }
      const fallbackUser = {
        id: payload.sub,
        org_id: payload.org_id,
        role: payload.role,
        email: '',
        name: '',
      }
      const res = await fetch(`${API_URL}/v1/app/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        if (res.status === 401) return { authenticated: false, user: null }
        return { authenticated: true, user: fallbackUser }
      }
      const data = (await res.json()) as {
        user?: { id: string; name: string; email: string; role: string; org_id: string }
      }
      const u = data.user
      if (!u) return { authenticated: true, user: fallbackUser }
      return {
        authenticated: true,
        user: {
          id: u.id,
          org_id: u.org_id,
          role: u.role,
          email: u.email,
          name: u.name ?? u.email,
        },
      }
    } catch {
      try {
        const payload = JSON.parse(atob(token.split('.')[1])) as {
          sub: string
          org_id: string
          role: string
        }
        return {
          authenticated: true,
          user: {
            id: payload.sub,
            org_id: payload.org_id,
            role: payload.role,
            email: '',
            name: '',
          },
        }
      } catch {
        return { authenticated: false, user: null }
      }
    }
  })

  ipcMain.handle(
    'timer:start',
    async (
      _,
      args: {
        projectId?: string | null
        taskId?: string | null
        notes?: string | null
      }
    ) => {
      const token = await ensureValidSession(mainWindow ?? undefined)
      if (!token) throw new Error('Not authenticated')

      savedAutoStopContext = null

      const payload = JSON.parse(atob(token.split('.')[1])) as {
        sub: string
        org_id: string
      }

      const deviceId = getDeviceId()
      const deviceName = `${app.getName()} on ${process.platform}`

      const result = startTimer({
        userId: payload.sub,
        orgId: payload.org_id,
        deviceId,
        deviceName,
        projectId: args.projectId ?? null,
        taskId: args.taskId ?? null,
        notes: args.notes ?? null,
      })

      // Start activity monitoring + screenshot scheduler + idle manager
      const sessionId = (result as { session: { id: string } }).session?.id
      if (sessionId) {
        // Create session on backend so screenshot uploads can succeed
        syncRunningSessionToBackend(sessionId).catch(() => {})
        const orgSettings = await fetchOrgSettings()
        const idleTimeoutIntervals = orgSettings?.idle_timeout_intervals ?? 3
        const idleDetectionEnabled = orgSettings?.idle_detection_enabled ?? true
        if (idleDetectionEnabled && !isInputMonitorAvailable()) {
          console.warn(
            '[idleManager] Input monitor unavailable — auto-restart on activity disabled. On macOS: add app to System Preferences > Privacy & Security > Accessibility.'
          )
        }
        startIdleManager(
          {
            idleTimeoutMs: idleTimeoutIntervals * 10 * 1000,
            idleDetectionEnabled,
          },
          {
            onAutoStop: handleAutoStop,
            onActivityResume: () => {
              if (savedAutoStopContext && !isAutoRestarting) performAutoRestart()
            },
          }
        )
        const screenshotIntervalSec = orgSettings?.screenshot_interval_seconds ?? 60
        console.log('[timer] Screenshot interval from org:', screenshotIntervalSec, 's')
        startScreenshotScheduler(sessionId, screenshotIntervalSec, (takenAt) => {
          mainWindow?.webContents.send('screenshot:captured', { taken_at: takenAt })
        })
        startWindowBuffer(sessionId)
        startInputMonitor()
        startActiveWindowPolling()
      }

      return result
    }
  )

  ipcMain.handle('timer:stop', async () => {
    // Stop idle manager and activity monitoring
    stopIdleManager()
    clearResumePolling()
    savedAutoStopContext = null
    stopScreenshotScheduler()
    stopWindowBuffer()
    stopInputMonitor()
    stopActiveWindowPolling()

    const result = stopTimer()
    // Trigger sync immediately after stopping
    triggerImmediateSync()
    return result
  })

  ipcMain.handle('activity:current-stats', () => {
    try {
      const score = getActivityPercentForTrackedTime()
      const inputAvailable = isInputMonitorAvailable()
      return { score, monitoring: true, inputAvailable }
    } catch (err) {
      // DB may be closed during app shutdown
      return { score: 0, monitoring: false, inputAvailable: false }
    }
  })

  ipcMain.handle(
    'timer:switch-task',
    async (
      _,
      args: {
        projectId?: string | null
        taskId?: string | null
        notes?: string | null
      }
    ) => {
      const result = switchTask(args)
      return result
    }
  )

  ipcMain.handle('timer:status', () => {
    return getTimerStatus()
  })

  ipcMain.handle('sessions:list-local', async () => {
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (!token) return []

    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { sub: string }
      return getTodaySessions(payload.sub)
    } catch {
      return []
    }
  })

  ipcMain.handle('sync:status', () => {
    return { pending: getPendingSyncCount() }
  })

  ipcMain.handle('streak:get', async () => {
    let backendStreak = 0
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (token) {
      try {
        const res = await fetch(`${API_URL}/v1/app/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = (await res.json()) as { user?: { streak?: number } }
          if (typeof data.user?.streak === 'number') backendStreak = data.user.streak
        }
      } catch {
        // Ignore
      }
    }
    let localStreak = 0
    try {
      const db = getDb()
      localStreak = computeStreakFromLocalSessions(db)
    } catch {
      // Ignore
    }
    return Math.max(backendStreak, localStreak)
  })

  ipcMain.handle('sync:trigger', async () => {
    triggerImmediateSync()
    return { triggered: true }
  })

  // Screenshots list (local SQLite)
  ipcMain.handle('screenshots:list-local', async () => {
    try {
      const { getDb } = await import('./db/index.js')
      const db = getDb()
      return db
        .prepare(
          `SELECT id, session_id, local_path, taken_at, activity_score, file_size_bytes, synced, created_at
         FROM local_screenshots ORDER BY taken_at DESC LIMIT 100`
        )
        .all()
    } catch {
      return []
    }
  })

  // Last screenshot capture time (for footer display)
  ipcMain.handle('screenshots:last-captured', async () => {
    try {
      const db = getDb()
      const row = db
        .prepare('SELECT taken_at FROM local_screenshots ORDER BY taken_at DESC LIMIT 1')
        .get() as { taken_at: string } | undefined
      return row?.taken_at ?? null
    } catch {
      return null
    }
  })

  // All local sessions (for reports page — beyond just today)
  // Onboarding handlers
  ipcMain.handle('onboarding:status', () => {
    const store = getOnboardingStore()
    return { done: store.isDone() }
  })

  ipcMain.handle('onboarding:complete', () => {
    getOnboardingStore().markDone()
    return { ok: true }
  })

  // macOS permissions
  ipcMain.handle('permissions:request', async (_, permissionId: string) => {
    if (process.platform !== 'darwin') return true
    try {
      if (permissionId === 'screen') {
        // screen is not a valid getMediaAccessStatus type on macOS;
        // screen recording cannot be requested programmatically — user must enable in System Prefs
        return true
      }
      if (permissionId === 'accessibility') {
        const trusted = systemPreferences.isTrustedAccessibilityClient(true)
        return trusted
      }
    } catch {
      return true
    }
    return true
  })

  ipcMain.handle('sessions:list-all-local', async () => {
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (!token) return []
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { sub: string }
      const { getDb } = await import('./db/index.js')
      const db = getDb()
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      return db
        .prepare(
          `SELECT id, started_at, ended_at, duration_sec, project_id, task_id, notes, synced
         FROM local_sessions WHERE user_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 200`
        )
        .all(payload.sub, thirtyDaysAgo)
    } catch {
      return []
    }
  })

  ipcMain.handle('sessions:list-recent', async () => {
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (!token) return []
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { sub: string }
      const { getDb } = await import('./db/index.js')
      const db = getDb()
      // Last 50 completed sessions regardless of day (enough to produce 10 unique merged entries)
      return db
        .prepare(
          `SELECT id, started_at, ended_at, duration_sec, project_id, task_id, notes, synced
         FROM local_sessions
         WHERE user_id = ? AND ended_at IS NOT NULL
         ORDER BY ended_at DESC LIMIT 50`
        )
        .all(payload.sub)
    } catch {
      return []
    }
  })
}

// ── Project IPC Handlers (separate so they register before window loads) ───────

function registerProjectHandlers(): void {
  async function fetchProjects(forceRefresh = false): Promise<unknown[]> {
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (!token) return []
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { org_id: string }
      const orgId = payload.org_id
      const cached = projectCache.get(orgId)
      if (!forceRefresh && cached && Date.now() - cached.fetchedAt < PROJECT_CACHE_TTL_MS) {
        return cached.projects
      }
      const url = `${API_URL}/v1/projects?limit=100`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return cached?.projects ?? []
      const data = (await res.json()) as { projects: unknown[] }
      projectCache.set(orgId, { projects: data.projects, fetchedAt: Date.now() })
      return data.projects
    } catch {
      return []
    }
  }

  ipcMain.handle('projects:list', async (_, forceRefresh?: boolean) =>
    fetchProjects(!!forceRefresh)
  )

  ipcMain.handle(
    'projects:search-tasks',
    async (_, query: string, assigneeFilter?: 'me' | 'all') => {
      const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
      if (!token) return []

      try {
        const filter = assigneeFilter === 'me' ? 'me' : 'all'
        const encoded = encodeURIComponent(query.trim())
        const res = await fetch(
          `${API_URL}/v1/projects/tasks/search?q=${encoded}&assigneeFilter=${filter}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) return []
        const data = (await res.json()) as { tasks: unknown[] }
        return data.tasks
      } catch {
        return []
      }
    }
  )

  ipcMain.handle('projects:tasks', async (_, projectId: string, assigneeFilter?: 'me' | 'all') => {
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (!token) return []

    try {
      const filter = assigneeFilter === 'me' ? 'me' : 'all'
      const res = await fetch(
        `${API_URL}/v1/projects/${projectId}/tasks?status=open&assigneeFilter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return []
      const data = (await res.json()) as { tasks: unknown[] }
      return data.tasks
    } catch {
      return []
    }
  })
}
