import { captureAndStore } from './capture.js'

const JITTER_SEC = 15

let schedulerTimer: ReturnType<typeof setTimeout> | null = null
let activeSessionId: string | null = null
let activeIntervalSec = 300

function scheduleNext(intervalSec: number, sessionId: string): void {
  const jitter = Math.floor(Math.random() * JITTER_SEC * 2) - JITTER_SEC
  const delay = Math.max(intervalSec + jitter, 30) * 1000

  schedulerTimer = setTimeout(async () => {
    if (!activeSessionId) return
    await captureAndStore(sessionId)
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
