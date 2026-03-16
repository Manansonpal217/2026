import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { getDb } from '../db/index.js'
import { getActiveSession, setActiveSession, getElapsedSeconds } from './store.js'
import type { BrowserWindow } from 'electron'

let mainWindowRef: (() => BrowserWindow | null) | null = null

export function setTimerWindowRef(getWin: () => BrowserWindow | null): void {
  mainWindowRef = getWin
}

export interface StartTimerArgs {
  userId: string
  orgId: string
  deviceId: string
  deviceName: string
  projectId?: string | null
  taskId?: string | null
  notes?: string | null
}

export interface TimerStatus {
  running: boolean
  elapsed: number
  session: {
    id: string
    startedAt: string
    projectId: string | null
    taskId: string | null
    notes: string | null
  } | null
}

export function startTimer(args: StartTimerArgs): TimerStatus {
  // Stop any running session first
  if (getActiveSession()) {
    stopTimer()
  }

  const db = getDb()
  const id = uuidv4()
  const startedAt = new Date()

  db.prepare(`
    INSERT INTO local_sessions
      (id, user_id, org_id, project_id, task_id, device_id, device_name,
       started_at, ended_at, duration_sec, is_manual, notes, synced, sync_attempts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, 0, 0, ?)
  `).run(
    id,
    args.userId,
    args.orgId,
    args.projectId ?? null,
    args.taskId ?? null,
    args.deviceId,
    args.deviceName,
    startedAt.toISOString(),
    args.notes ?? null,
    startedAt.toISOString(),
  )

  const intervalId = setInterval(() => {
    const elapsed = getElapsedSeconds()
    const win = mainWindowRef?.()
    win?.webContents.send('timer:tick', elapsed)
  }, 1000)

  setActiveSession({
    id,
    userId: args.userId,
    orgId: args.orgId,
    deviceId: args.deviceId,
    deviceName: args.deviceName,
    startedAt,
    projectId: args.projectId ?? null,
    taskId: args.taskId ?? null,
    notes: args.notes ?? null,
    intervalId,
  })

  return getTimerStatus()
}

export function stopTimer(): { session: Record<string, unknown> } | null {
  const session = getActiveSession()
  if (!session) return null

  // Clear the tick interval
  if (session.intervalId !== null) {
    clearInterval(session.intervalId)
  }

  const endedAt = new Date()
  const durationSec = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000)

  const db = getDb()
  db.prepare(`
    UPDATE local_sessions
    SET ended_at = ?, duration_sec = ?, notes = ?, synced = 0
    WHERE id = ?
  `).run(endedAt.toISOString(), durationSec, session.notes, session.id)

  const row = db.prepare('SELECT * FROM local_sessions WHERE id = ?').get(session.id)

  setActiveSession(null)

  // Notify renderer that timer stopped
  const win = mainWindowRef?.()
  win?.webContents.send('timer:stopped', { elapsed: durationSec })

  return { session: row as Record<string, unknown> }
}

export function switchTask(args: Omit<StartTimerArgs, 'userId' | 'orgId' | 'deviceId' | 'deviceName'>): TimerStatus {
  const current = getActiveSession()
  if (!current) {
    throw new Error('No active timer to switch')
  }

  // Preserve user/device context from current session
  stopTimer()

  return startTimer({
    userId: current.userId,
    orgId: current.orgId,
    deviceId: current.deviceId,
    deviceName: current.deviceName,
    projectId: args.projectId ?? null,
    taskId: args.taskId ?? null,
    notes: args.notes ?? null,
  })
}

export function getTimerStatus(): TimerStatus {
  const session = getActiveSession()
  return {
    running: session !== null,
    elapsed: getElapsedSeconds(),
    session: session
      ? {
          id: session.id,
          startedAt: session.startedAt.toISOString(),
          projectId: session.projectId,
          taskId: session.taskId,
          notes: session.notes,
        }
      : null,
  }
}

export function getTodaySessions(userId: string): unknown[] {
  const db = getDb()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return db
    .prepare(
      `SELECT * FROM local_sessions
       WHERE user_id = ? AND started_at >= ?
       ORDER BY started_at DESC`,
    )
    .all(userId, todayStart.toISOString())
}

export function getDeviceId(): string {
  // Use app name + version as a stable device identifier in dev
  // In production this would use a stored UUID from secure storage
  try {
    const db = getDb()
    let row = db.prepare('SELECT value FROM __config WHERE key = ?').get('device_id') as
      | { value: string }
      | undefined

    if (!row) {
      const newId = uuidv4()
      db.exec(`CREATE TABLE IF NOT EXISTS __config (key TEXT PRIMARY KEY, value TEXT)`)
      db.prepare('INSERT OR IGNORE INTO __config (key, value) VALUES (?, ?)').run(
        'device_id',
        newId,
      )
      row = { value: newId }
    }
    return row.value
  } catch {
    return `${app.getName()}-${process.platform}`
  }
}
