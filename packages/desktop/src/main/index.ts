import 'dotenv/config'
import * as Sentry from '@sentry/electron/main'
import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  powerMonitor,
  shell,
  systemPreferences,
} from 'electron'
import { autoUpdater } from 'electron-updater'
import electronLog from 'electron-log'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { decodeJwt } from 'jose'
import { authHandlers, ensureValidSession, ensureValidSessionDetailed } from './auth/handlers.js'
import { loadTokens } from './auth/keychain.js'
import { registerJiraHandlers } from './jira/ipcHandlers.js'
import { handleJiraProtocolUrl } from './jira/auth.js'
import { initJiraApi } from './jira/api.js'
import { handleAsanaProtocolUrl, setAsanaMainWindowGetter } from './asana/auth.js'
import { registerAsanaHandlers } from './asana/ipcHandlers.js'
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
import {
  drainPendingSyncQueue,
  getPendingSyncBreakdown,
  markLocalDataForFullResync,
} from './sync/repairResync.js'
import { startScreenshotScheduler, stopScreenshotScheduler } from './screenshot/scheduler.js'
import { getApiBase, syncRunningSessionToBackend } from './sync/sessionSync.js'
import { startWindowBuffer, stopWindowBuffer } from './activity/windowBuffer.js'
import {
  startInputMonitor,
  stopInputMonitor,
  isInputMonitorAvailable,
} from './activity/inputMonitor.js'
import { pruneOldIntervals } from './activity/intervalTracker.js'
import { getWeightedActivityScoreLocalCalendarDay } from './activity/dayWeightedScore.js'
import { startActiveWindowPolling, stopActiveWindowPolling } from './activity/activeWin.js'
import { startIdleManager, stopIdleManager, type StopReason } from './idle/idleManager.js'
import { getDb } from './db/index.js'
import { computeStreakFromLocalSessions } from './streak.js'
import { readUserPrefs, writeUserPrefs } from './userPrefs.js'

declare const __TRACKSYNC_UPDATE_BASE_URL__: string
declare const __SENTRY_DSN__: string

function initSentry(): void {
  const dsn = typeof __SENTRY_DSN__ !== 'undefined' ? String(__SENTRY_DSN__).trim() : ''
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: app.isPackaged ? 'production' : 'development',
  })
}

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'
/** Next.js landing (my home dashboard). Override in production, e.g. https://tracksync.dev */
const LANDING_URL = (process.env.VITE_LANDING_URL || 'http://localhost:3002').replace(/\/$/, '')

// In-memory project cache: { orgId -> { projects, fetchedAt } }
const projectCache = new Map<string, { projects: unknown[]; fetchedAt: number }>()
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Auto-stop/restart state (idle manager)
let savedAutoStopContext: SessionContext | null = null
let isAutoRestarting = false
let resumePollIntervalId: ReturnType<typeof setInterval> | null = null
let lastAutoRestartFailedAt = 0

const ACTIVITY_THRESHOLD_SEC = 5
const RESUME_POLL_MS = 2000
const AUTO_RESTART_COOLDOWN_MS = 60_000

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

let resolvedSettingsCache: Record<string, string> | null = null
let resolvedSettingsCacheExpiry = 0
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000

async function fetchResolvedSettings(): Promise<Record<string, string> | null> {
  const now = Date.now()
  if (resolvedSettingsCache && now < resolvedSettingsCacheExpiry) return resolvedSettingsCache
  const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
  if (!token) return resolvedSettingsCache
  try {
    const res = await fetch(`${API_URL}/v1/app/settings/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return resolvedSettingsCache
    const data = (await res.json()) as { settings: Record<string, string> }
    resolvedSettingsCache = data.settings
    resolvedSettingsCacheExpiry = now + SETTINGS_CACHE_TTL_MS
    return resolvedSettingsCache
  } catch {
    return resolvedSettingsCache
  }
}

function invalidateResolvedSettingsCache(): void {
  resolvedSettingsCacheExpiry = 0
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
    silent: true,
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
    silent: true,
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
  lastAutoRestartFailedAt = 0

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
        silent: true,
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
  if (Date.now() - lastAutoRestartFailedAt < AUTO_RESTART_COOLDOWN_MS) {
    savedAutoStopContext = null
    clearResumePolling()
    return
  }
  console.log('[idleManager] Performing auto-restart')
  isAutoRestarting = true
  try {
    const session = await ensureValidSessionDetailed(mainWindow ?? undefined)
    if (!session.ok) {
      console.warn('[idleManager] Auto-restart failed:', session.reason)
      lastAutoRestartFailedAt = Date.now()
      savedAutoStopContext = null
      if (Notification.isSupported()) {
        const body =
          session.reason === 'network'
            ? 'Could not auto-restart — no connection. Reconnect, then start manually.'
            : session.reason === 'storage_unreadable'
              ? 'Could not auto-restart — saved sign-in could not be read. Sign in again, then start manually.'
              : 'Could not auto-restart — please sign in and start manually.'
        const notif = new Notification({
          title: 'TrackSync',
          body,
          silent: true,
        })
        notificationRefs.push(notif)
        notif.on('close', () => clearNotification(notif))
        notif.on('click', () => clearNotification(notif))
        notif.show()
      }
      return
    }
    const token = session.token
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
      const sessionOnServer = await syncRunningSessionToBackend(sessionId)
      if (!sessionOnServer) {
        console.warn(
          '[timer] Running session not registered on server yet; screenshots will retry sync until it succeeds.'
        )
      }
      const orgSettings = await fetchOrgSettings()
      const resolved = await fetchResolvedSettings()
      const screenshotIntervalSec = resolved?.ss_capture_interval_seconds
        ? Number(resolved.ss_capture_interval_seconds)
        : (orgSettings?.screenshot_interval_seconds ?? 60)
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
    lastAutoRestartFailedAt = Date.now()
    savedAutoStopContext = null
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'TrackSync',
        body: 'Could not auto-restart — please start manually.',
        silent: true,
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

function handleProtocolUrl(url: string): void {
  if (handleAsanaProtocolUrl(url)) {
    mainWindow?.focus()
    return
  }
  if (handleJiraProtocolUrl(url)) {
    mainWindow?.focus()
  }
}

let autoUpdaterEnabled = false

function initAutoUpdater(): void {
  if (!app.isPackaged) return
  const raw =
    typeof __TRACKSYNC_UPDATE_BASE_URL__ !== 'undefined' ? __TRACKSYNC_UPDATE_BASE_URL__ : ''
  const base = raw?.trim()
  if (!base) {
    console.log(
      '[updater] Set AUTO_UPDATE_BASE_URL when building to enable auto-updates (generic feed).'
    )
    return
  }
  autoUpdaterEnabled = true
  autoUpdater.logger = electronLog
  autoUpdater.autoDownload = true
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: base.replace(/\/$/, '') })
  } catch (e) {
    console.warn('[updater] setFeedURL failed', e)
    autoUpdaterEnabled = false
    return
  }
  autoUpdater.on('update-available', (info) => {
    electronLog.info('[updater] update available', info.version)
    mainWindow?.webContents.send('updater:available', { version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => {
    electronLog.info('[updater] update downloaded', info.version)
    mainWindow?.webContents.send('updater:downloaded', { version: info.version })
  })
  autoUpdater.on('error', (err) => electronLog.warn('[updater]', err))
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((e) => electronLog.warn('[updater] check failed', e))
  }, 10_000)
}

app.whenReady().then(async () => {
  initSentry()

  app.setAsDefaultProtocolClient('tracksync')

  const protocolUrl = process.argv.find((arg) => arg.startsWith('tracksync://'))
  if (protocolUrl) {
    setTimeout(() => handleProtocolUrl(protocolUrl), 1000)
  }

  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    return
  }
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith('tracksync://'))
    if (url) handleProtocolUrl(url)
    mainWindow?.focus()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })

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

  // Register Jira IPC handlers
  registerJiraHandlers(ipcMain)
  registerAsanaHandlers(ipcMain)
  setAsanaMainWindowGetter(() => mainWindow)
  initJiraApi(() => mainWindow)

  // Theme: sync window background with app theme (hides title bar seam in light mode)
  ipcMain.handle('theme:set-background', (_e, theme: 'light' | 'dark') => {
    const color = theme === 'light' ? '#f8fafc' : '#050508'
    mainWindow?.setBackgroundColor(color)
  })

  ipcMain.handle('landing:open-myhome', async (_e, userId: unknown) => {
    if (
      typeof userId !== 'string' ||
      userId.length === 0 ||
      userId.length > 200 ||
      /[/\\?#]/.test(userId)
    ) {
      return { ok: false as const, error: 'invalid user id' }
    }
    const url = `${LANDING_URL}/myhome/${encodeURIComponent(userId)}`
    await shell.openExternal(url)
    return { ok: true as const }
  })

  // Register timer IPC handlers (must run before createWindow so handlers are ready)
  setTimerWindowRef(() => mainWindow)
  registerTimerHandlers()
  registerProjectHandlers()

  createWindow()

  initAutoUpdater()

  ipcMain.handle('updater:quit-and-install', () => {
    if (!autoUpdaterEnabled) return { ok: false as const, error: 'updater_disabled' }
    try {
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: String(e) }
    }
  })

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
    invalidateResolvedSettingsCache()
    const result = await ensureValidSessionDetailed(mainWindow ?? undefined).catch(() => null)

    if (!result?.ok) {
      if (result?.reason === 'network') {
        const tokens = await loadTokens()
        if (tokens) {
          try {
            const payload = decodeJwt(tokens.accessToken) as {
              sub?: string
              org_id?: string
              role?: string
            }
            return {
              authenticated: true,
              offline: true,
              user: {
                id: payload.sub ?? '',
                org_id: payload.org_id ?? '',
                role: payload.role ?? '',
                email: '',
                name: '',
              },
              org_settings: null,
              reason: 'network' as const,
            }
          } catch {
            // fall through
          }
        }
      }
      return {
        authenticated: false,
        user: null,
        reason: result?.reason ?? 'unknown',
      }
    }

    const token = result.token
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
        return { authenticated: true, user: fallbackUser, org_settings: null }
      }
      const data = (await res.json()) as {
        user?: { id: string; name: string; email: string; role: string; org_id: string }
        org_settings?: { work_platform?: string } | null
      }
      const u = data.user
      if (!u) {
        return {
          authenticated: true,
          user: fallbackUser,
          org_settings: data.org_settings ?? null,
        }
      }
      return {
        authenticated: true,
        user: {
          id: u.id,
          org_id: u.org_id,
          role: u.role,
          email: u.email,
          name: u.name ?? u.email,
        },
        org_settings: data.org_settings ?? null,
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
          org_settings: null,
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
      const session = await ensureValidSessionDetailed(mainWindow ?? undefined)
      if (!session.ok) {
        if (session.reason === 'network') {
          throw new Error('Unable to reach TrackSync. Check your connection, then try again.')
        }
        if (session.reason === 'storage_unreadable') {
          throw new Error(
            'Saved sign-in could not be decrypted (e.g. after reinstall or a keychain change). Please sign in again.'
          )
        }
        if (session.reason === 'missing') {
          mainWindow?.webContents.send('auth:session-expired')
        }
        throw new Error('Your session has expired. Please sign in again.')
      }
      const token = session.token

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
        const sessionOnServer = await syncRunningSessionToBackend(sessionId)
        if (!sessionOnServer) {
          console.warn(
            '[timer] Running session not registered on server yet; screenshots will retry sync until it succeeds.'
          )
        }
        const orgSettings = await fetchOrgSettings()
        const resolved = await fetchResolvedSettings()
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
        const screenshotIntervalSec = resolved?.ss_capture_interval_seconds
          ? Number(resolved.ss_capture_interval_seconds)
          : (orgSettings?.screenshot_interval_seconds ?? 60)
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

  ipcMain.handle('activity:current-stats', async () => {
    try {
      let userSub: string | null = null
      const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
      if (token) {
        try {
          userSub = (JSON.parse(atob(token.split('.')[1])) as { sub: string }).sub
        } catch {
          userSub = null
        }
      }
      const score = userSub ? getWeightedActivityScoreLocalCalendarDay(userSub) : null
      const inputAvailable = isInputMonitorAvailable()
      return { score, monitoring: true, inputAvailable }
    } catch (err) {
      // DB may be closed during app shutdown
      return { score: null, monitoring: false, inputAvailable: false }
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
    const b = getPendingSyncBreakdown()
    return {
      pending: b.sessions,
      pendingActivity: b.activityLogs,
      pendingScreenshots: b.screenshots,
    }
  })

  ipcMain.handle('sync:repair-and-resync', async () => {
    const marked = markLocalDataForFullResync()
    const drain = await drainPendingSyncQueue()
    let sampleSyncErrors: string[] = []
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT DISTINCT last_sync_error as e FROM local_sessions
           WHERE synced = 0 AND ended_at IS NOT NULL AND last_sync_error IS NOT NULL AND trim(last_sync_error) != ''
           LIMIT 5`
        )
        .all() as { e: string }[]
      sampleSyncErrors = rows.map((r) => r.e).filter(Boolean)
    } catch {
      sampleSyncErrors = []
    }
    return { marked, drain, desktopApiBase: getApiBase(), sampleSyncErrors }
  })

  ipcMain.handle('streak:get', async () => {
    let backendStreak = 0
    let userSub: string | null = null
    const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
    if (token) {
      try {
        userSub = (JSON.parse(atob(token.split('.')[1])) as { sub: string }).sub
      } catch {
        userSub = null
      }
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
    if (userSub) {
      try {
        const db = getDb()
        localStreak = computeStreakFromLocalSessions(db, userSub)
      } catch {
        // Ignore
      }
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
          `SELECT id, session_id, local_path, taken_at, activity_score, file_size_bytes, synced, last_sync_error, created_at
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
      const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
      if (!token) return null
      let userId: string
      try {
        userId = (JSON.parse(atob(token.split('.')[1])) as { sub: string }).sub
      } catch {
        return null
      }
      const db = getDb()
      const row = db
        .prepare(
          `SELECT ss.taken_at FROM local_screenshots ss
           INNER JOIN local_sessions ls ON ls.id = ss.session_id
           WHERE ls.user_id = ?
           ORDER BY ss.taken_at DESC LIMIT 1`
        )
        .get(userId) as { taken_at: string } | undefined
      return row?.taken_at ?? null
    } catch {
      return null
    }
  })

  /** For Screenshots UI: confirm desktop points at same API as web (VITE_API_URL). */
  ipcMain.handle('sync:debug-info', () => ({ apiBase: getApiBase() }))

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

  ipcMain.handle('prefs:get', () => readUserPrefs())

  ipcMain.handle('prefs:set-notify-screenshot-capture', (_, enabled: unknown) => {
    return writeUserPrefs({ notifyOnScreenshotCapture: enabled === true })
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
      if (!token) return { tasks: [], syncedJiraIssues: [] }

      try {
        const filter = assigneeFilter === 'me' ? 'me' : 'all'
        const encoded = encodeURIComponent(query.trim())
        const taskUrl = `${API_URL}/v1/projects/tasks/search?q=${encoded}&assigneeFilter=${filter}`
        const jiraUrl = `${API_URL}/v1/integrations/jira/issues/search?q=${encoded}&assigneeFilter=all`

        const [taskRes, jiraRes] = await Promise.all([
          fetch(taskUrl, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(jiraUrl, { headers: { Authorization: `Bearer ${token}` } }),
        ])

        const tasks = taskRes.ok
          ? (((await taskRes.json()) as { tasks?: unknown[] }).tasks ?? [])
          : []
        const syncedJiraIssues = jiraRes.ok
          ? (((await jiraRes.json()) as { issues?: unknown[] }).issues ?? [])
          : []

        return { tasks, syncedJiraIssues }
      } catch {
        return { tasks: [], syncedJiraIssues: [] }
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
