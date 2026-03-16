import { getDb } from '../db/index.js'
import { getActivityPercent } from '../activity/intervalTracker.js'
import { captureAndStore } from './capture.js'

const JITTER_SEC = 15

let schedulerTimer: ReturnType<typeof setTimeout> | null = null
let activeSessionId: string | null = null
let activeIntervalSec = 300

function getPeriodStartForScreenshot(sessionId: string): number {
  const db = getDb()

  // Last screenshot for this session
  const lastScreenshot = db
    .prepare(
      'SELECT taken_at FROM local_screenshots WHERE session_id = ? ORDER BY taken_at DESC LIMIT 1',
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

  schedulerTimer = setTimeout(async () => {
    if (!activeSessionId) return

    const periodStart = getPeriodStartForScreenshot(sessionId)
    const periodEnd = Date.now()
    const activityScore = getActivityPercent(periodStart, periodEnd)

    await captureAndStore(sessionId, activityScore)
    scheduleNext(intervalSec, sessionId)
  }, delay)
}

export function startScreenshotScheduler(sessionId: string, intervalSec = 300): void {
  stopScreenshotScheduler()
  activeSessionId = sessionId
  activeIntervalSec = intervalSec
  scheduleNext(intervalSec, sessionId)
}

export function stopScreenshotScheduler(): void {
  activeSessionId = null
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
  }
}

export function isSchedulerRunning(): boolean {
  return activeSessionId !== null
}
