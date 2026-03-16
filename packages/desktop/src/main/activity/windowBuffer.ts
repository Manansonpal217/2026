import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/index.js'
import { computeActivityScore } from './scorer.js'
import type { ActivityWeights, ActivityBaseline } from './scorer.js'

const WINDOW_DURATION_MS = 10 * 1000 // 10 seconds

interface WindowAccumulator {
  sessionId: string
  windowStart: Date
  keyboardEvents: number
  mouseClicks: number
  mouseDistancePx: number
  activeApps: Map<string, number>
  sampleCount: number
}

let accumulator: WindowAccumulator | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null

export function startWindowBuffer(
  sessionId: string,
  weights?: ActivityWeights,
  baseline?: ActivityBaseline
): void {
  accumulator = {
    sessionId,
    windowStart: new Date(),
    keyboardEvents: 0,
    mouseClicks: 0,
    mouseDistancePx: 0,
    activeApps: new Map(),
    sampleCount: 0,
  }

  flushTimer = setInterval(() => flushWindow(weights, baseline), WINDOW_DURATION_MS)
}

export function stopWindowBuffer(weights?: ActivityWeights, baseline?: ActivityBaseline): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (accumulator) {
    flushWindow(weights, baseline)
  }
  accumulator = null
}

export function addKeyboardEvent(): void {
  if (accumulator) accumulator.keyboardEvents++
}

export function addMouseClick(): void {
  if (accumulator) accumulator.mouseClicks++
}

export function addMouseMovement(distancePx: number): void {
  if (accumulator) accumulator.mouseDistancePx += distancePx
}

export function setActiveApp(appName: string): void {
  if (!accumulator) return
  const prev = accumulator.activeApps.get(appName) ?? 0
  accumulator.activeApps.set(appName, prev + 1)
  accumulator.sampleCount++
}

/** Returns current activity score (0–100) from accumulated inputs, or null if not monitoring. */
export function getCurrentActivityScore(
  weights?: ActivityWeights,
  baseline?: ActivityBaseline
): number | null {
  if (!accumulator) return null
  const now = new Date()
  const durationMin = (now.getTime() - accumulator.windowStart.getTime()) / 60000
  if (durationMin <= 0) return 0
  return computeActivityScore(
    {
      keyboardEvents: accumulator.keyboardEvents,
      mouseClicks: accumulator.mouseClicks,
      mouseDistancePx: accumulator.mouseDistancePx,
    },
    durationMin,
    baseline,
    weights
  )
}

function getMostUsedApp(acc: WindowAccumulator): string | null {
  if (acc.activeApps.size === 0) return null
  let maxCount = 0
  let maxApp: string | null = null
  for (const [app, count] of acc.activeApps) {
    if (count > maxCount) {
      maxCount = count
      maxApp = app
    }
  }
  return maxApp
}

function flushWindow(weights?: ActivityWeights, baseline?: ActivityBaseline): void {
  if (!accumulator) return

  const db = getDb()
  const windowEnd = new Date()
  const durationMin = (windowEnd.getTime() - accumulator.windowStart.getTime()) / 60000

  const score = computeActivityScore(
    {
      keyboardEvents: accumulator.keyboardEvents,
      mouseClicks: accumulator.mouseClicks,
      mouseDistancePx: accumulator.mouseDistancePx,
    },
    durationMin,
    baseline,
    weights
  )

  const mostUsedApp = getMostUsedApp(accumulator)

  db.prepare(
    `
    INSERT OR IGNORE INTO local_activity_logs
      (id, session_id, window_start, window_end, keyboard_events, mouse_clicks,
       mouse_distance_px, active_app, activity_score, synced, sync_attempts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `
  ).run(
    uuidv4(),
    accumulator.sessionId,
    accumulator.windowStart.toISOString(),
    windowEnd.toISOString(),
    accumulator.keyboardEvents,
    accumulator.mouseClicks,
    accumulator.mouseDistancePx,
    mostUsedApp,
    score,
    new Date().toISOString()
  )

  // Reset for next window
  accumulator = {
    sessionId: accumulator.sessionId,
    windowStart: windowEnd,
    keyboardEvents: 0,
    mouseClicks: 0,
    mouseDistancePx: 0,
    activeApps: new Map(),
    sampleCount: 0,
  }
}
