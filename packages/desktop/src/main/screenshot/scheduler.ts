import { getDb } from '../db/index.js'
import { getActivityPercent } from '../activity/intervalTracker.js'
import { captureAndStore } from './capture.js'

const JITTER_SEC = 15

let schedulerTimer: ReturnType<typeof setTimeout> | null = null
let activeSessionId: string | null = null
let schedulerOnCapture: ((takenAt: string) => void) | null = null

function getPeriodStartForScreenshot(sessionId: string): number {
  const db = getDb()

  // Last screenshot for this session
  const lastScreenshot = db
    .prepare(
      'SELECT taken_at FROM local_screenshots WHERE session_id = ? ORDER BY taken_at DESC LIMIT 1'
    )
    .get(sessionId) as { taken_at: string } | undefined

  if (lastScreenshot) {
    return new Date(lastScreenshot.taken_at).getTime()
  }

  // First screenshot: use session start
  const session = db
    .prepare('SELECT started_at FROM local_sessions WHERE id = ? LIMIT 1')
    .get(sessionId) as { started_at: string } | undefined

  if (session) {
    return new Date(session.started_at).getTime()
  }

  // Fallback: 5 minutes ago
  return Date.now() - 5 * 60 * 1000
}

function scheduleNext(intervalSec: number, sessionId: string): void {
  const jitter = Math.floor(Math.random() * JITTER_SEC * 2) - JITTER_SEC
  const delay = Math.max(intervalSec + jitter, 30) * 1000

  console.log(
    '[screenshot] Next capture in',
    Math.round(delay / 1000),
    's (interval:',
    intervalSec,
    's, jitter:',
    jitter,
    's)'
  )

  schedulerTimer = setTimeout(async () => {
    if (!activeSessionId) return

    const periodStart = getPeriodStartForScreenshot(sessionId)
    const periodEnd = Date.now()
    const activityScore = getActivityPercent(periodStart, periodEnd)

    const id = await captureAndStore(sessionId, activityScore)
    if (id) {
      const takenAt = new Date().toISOString()
      schedulerOnCapture?.(takenAt)
    }
    scheduleNext(intervalSec, sessionId)
  }, delay)
}

export function startScreenshotScheduler(
  sessionId: string,
  intervalSec = 60,
  onCapture?: (takenAt: string) => void
): void {
  stopScreenshotScheduler()
  activeSessionId = sessionId
  schedulerOnCapture = onCapture ?? null
  console.log('[screenshot] Scheduler started, interval:', intervalSec, 's')
  scheduleNext(intervalSec, sessionId)
}

export function stopScreenshotScheduler(): void {
  activeSessionId = null
  schedulerOnCapture = null
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
  }
}

export function isSchedulerRunning(): boolean {
  return activeSessionId !== null
}
