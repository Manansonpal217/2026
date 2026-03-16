import { app, BrowserWindow, ipcMain, systemPreferences } from 'electron'
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
} from './timer/index.js'
import { startSyncScheduler, stopSyncScheduler, triggerImmediateSync } from './sync/scheduler.js'
import { getPendingSyncCount } from './sync/sessionSync.js'
import { startScreenshotScheduler, stopScreenshotScheduler } from './screenshot/scheduler.js'
import { startWindowBuffer, stopWindowBuffer, getCurrentActivityScore } from './activity/windowBuffer.js'
import { startInputMonitor, stopInputMonitor, isInputMonitorAvailable } from './activity/inputMonitor.js'
import { startActiveWindowPolling, stopActiveWindowPolling } from './activity/activeWin.js'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// In-memory project cache: { orgId -> { projects, fetchedAt } }
const projectCache = new Map<string, { projects: unknown[]; fetchedAt: number }>()
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let mainWindow: BrowserWindow | null = null

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
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_RENDERER_URL ||
    'http://localhost:5173'

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

  // Sync on window focus
  mainWindow.on('focus', () => {
    triggerImmediateSync()
  })
}

app.whenReady().then(async () => {
  // Open SQLite database (async — must await before registering handlers that use DB)
  await openDb()

  // Register auth IPC handlers
  authHandlers(ipcMain, () => mainWindow, () => projectCache.clear())

  // Theme: sync window background with app theme (hides title bar seam in light mode)
  ipcMain.handle('theme:set-background', (_e, theme: 'light' | 'dark') => {
    const color = theme === 'light' ? '#f8fafc' : '#050508'
    mainWindow?.setBackgroundColor(color)
  })

  // Register timer IPC handlers
  setTimerWindowRef(() => mainWindow)
  registerTimerHandlers()

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
  const { join } = require('path') as typeof import('path')
  const { existsSync, writeFileSync, readFileSync } = require('fs') as typeof import('fs')
  const storePath = join(app.getPath('userData'), 'onboarding.json')
  return {
    isDone: () => existsSync(storePath),
    markDone: () => writeFileSync(storePath, JSON.stringify({ done: true, ts: Date.now() }), 'utf-8'),
    read: () => {
      try { return JSON.parse(readFileSync(storePath, 'utf-8')) } catch { return null }
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
      const payload = JSON.parse(atob(token.split('.')[1])) as { sub: string; org_id: string; role: string }
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
      const data = (await res.json()) as { user?: { id: string; name: string; email: string; role: string; org_id: string } }
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
        const payload = JSON.parse(atob(token.split('.')[1])) as { sub: string; org_id: string; role: string }
        return {
          authenticated: true,
          user: { id: payload.sub, org_id: payload.org_id, role: payload.role, email: '', name: '' },
        }
      } catch {
        return { authenticated: false, user: null }
      }
    }
  })

  ipcMain.handle('timer:start', async (_, args: {
    projectId?: string | null
    taskId?: string | null
    notes?: string | null
    screenshotIntervalSec?: number
  }) => {
    const token = await ensureValidSession(mainWindow ?? undefined)
    if (!token) throw new Error('Not authenticated')

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

    // Start activity monitoring + screenshot scheduler
    const sessionId = (result as { session: { id: string } }).session?.id
    if (sessionId) {
      startScreenshotScheduler(sessionId, args.screenshotIntervalSec ?? 300)
      startWindowBuffer(sessionId)
      startInputMonitor()
      startActiveWindowPolling()
    }

    return result
  })

  ipcMain.handle('timer:stop', async () => {
    // Stop activity monitoring
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
    const score = getCurrentActivityScore()
    const inputAvailable = isInputMonitorAvailable()
    return { score: score ?? 0, monitoring: score !== null, inputAvailable }
  })

  ipcMain.handle('timer:switch-task', async (_, args: {
    projectId?: string | null
    taskId?: string | null
    notes?: string | null
  }) => {
    const result = switchTask(args)
    return result
  })

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

  ipcMain.handle('sync:trigger', async () => {
    triggerImmediateSync()
    return { triggered: true }
  })

  // Screenshots list (local SQLite)
  ipcMain.handle('screenshots:list-local', async () => {
    try {
      const { getDb } = await import('./db/index.js')
      const db = getDb()
      return db.prepare(
        `SELECT id, session_id, file_path, taken_at, activity_score, file_size_bytes, synced, created_at
         FROM local_screenshots ORDER BY taken_at DESC LIMIT 100`
      ).all()
    } catch {
      return []
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
      return db.prepare(
        `SELECT id, started_at, ended_at, duration_sec, project_id, task_id, notes, synced
         FROM local_sessions WHERE user_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 200`
      ).all(payload.sub, thirtyDaysAgo)
    } catch {
      return []
    }
  })

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

  ipcMain.handle('projects:list', async (_, forceRefresh?: boolean) => fetchProjects(!!forceRefresh))

  ipcMain.handle(
    'projects:tasks',
    async (
      _,
      projectId: string,
      assigneeFilter?: 'me' | 'all',
    ) => {
      const token = await ensureValidSession(mainWindow ?? undefined).catch(() => null)
      if (!token) return []

      try {
        const filter = assigneeFilter === 'me' ? 'me' : 'all'
        const res = await fetch(
          `${API_URL}/v1/projects/${projectId}/tasks?status=open&assigneeFilter=${filter}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) return []
        const data = (await res.json()) as { tasks: unknown[] }
        return data.tasks
      } catch {
        return []
      }
    },
  )
}
