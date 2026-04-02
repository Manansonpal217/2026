import { getDb } from '../db/index.js'

const INTERVAL_MS = 10_000

/**
 * Mark the current 10-second interval as having activity.
 * Called on any keyboard or mouse event.
 */
export function markIntervalActive(): void {
  try {
    const idx = Math.floor(Date.now() / INTERVAL_MS)
    getDb().prepare('INSERT OR IGNORE INTO active_intervals (interval_index) VALUES (?)').run(idx)
  } catch (err) {
    console.warn('[intervalTracker] markIntervalActive failed:', err)
  }
}

/**
 * Get activity percentage for a time period.
 * Activity % = (intervals with activity) / (total intervals in period) * 100
 *
 * @param periodStartMs Start of period (inclusive)
 * @param periodEndMs End of period (exclusive)
 * @returns 0–100
 */
export function getActivityPercent(periodStartMs: number, periodEndMs: number): number {
  const totalIntervals = Math.floor((periodEndMs - periodStartMs) / INTERVAL_MS)
  if (totalIntervals <= 0) return 0

  try {
    const startIdx = Math.floor(periodStartMs / INTERVAL_MS)
    const endIdx = startIdx + totalIntervals - 1

    const row = getDb()
      .prepare(
        'SELECT COUNT(*) as count FROM active_intervals WHERE interval_index >= ? AND interval_index <= ?'
      )
      .get(startIdx, endIdx) as { count: number }

    const activeCount = row?.count ?? 0

    const activeRows = getDb()
      .prepare(
        'SELECT interval_index FROM active_intervals WHERE interval_index >= ? AND interval_index <= ? ORDER BY interval_index'
      )
      .all(startIdx, endIdx) as { interval_index: number }[]

    const activeIndices = activeRows.map((r) => r.interval_index)
    const allIndicesInRange = Array.from({ length: totalIntervals }, (_, i) => startIdx + i)

    const percent = (activeCount / totalIntervals) * 100
    const rounded = Math.min(100, Math.round(percent))

    console.log('[intervalTracker] Activity calculation:', {
      period: {
        start: new Date(periodStartMs).toISOString(),
        end: new Date(periodEndMs).toISOString(),
        durationSec: Math.round((periodEndMs - periodStartMs) / 1000),
      },
      intervals: {
        total: totalIntervals,
        range: `[${startIdx}..${endIdx}]`,
        allIndices: allIndicesInRange,
      },
      activeIntervals: {
        count: activeCount,
        indices: activeIndices,
      },
      math: `${activeCount} / ${totalIntervals} * 100 = ${percent.toFixed(2)}%`,
      result: `${rounded}%`,
    })

    return rounded
  } catch (err) {
    console.warn('[intervalTracker] getActivityPercent failed:', err)
    return 0
  }
}

/**
 * Remove intervals from previous days. Keeps only today's data.
 * Call once at app startup.
 */
export function pruneOldIntervals(): void {
  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const startOfTodayMs = startOfToday.getTime()
    const cutoffIdx = Math.floor(startOfTodayMs / INTERVAL_MS)

    getDb().prepare('DELETE FROM active_intervals WHERE interval_index < ?').run(cutoffIdx)
  } catch (err) {
    console.warn('[intervalTracker] pruneOldIntervals failed:', err)
  }
}
