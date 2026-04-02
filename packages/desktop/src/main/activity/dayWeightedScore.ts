import { getDb } from '../db/index.js'

/** Same local calendar-day bounds as landing `startOfLocalDay` / `endOfLocalDay`. */
function localDayBoundsMs(ref = new Date()): { startMs: number; endMs: number } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0)
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999)
  return { startMs: start.getTime(), endMs: end.getTime() }
}

/**
 * Time-weighted average `activity_score` (0–100) for windows overlapping the user’s local
 * calendar day. Matches `weightedActivityScoreForRange` on the web dashboard for synced logs.
 */
export function getWeightedActivityScoreLocalCalendarDay(userId: string): number | null {
  const { startMs, endMs } = localDayBoundsMs()
  const dayStartIso = new Date(startMs).toISOString()
  const dayEndIso = new Date(endMs).toISOString()

  try {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT l.window_start, l.window_end, l.activity_score
         FROM local_activity_logs l
         INNER JOIN local_sessions s ON s.id = l.session_id
         WHERE s.user_id = ?
           AND l.window_end > ?
           AND l.window_start < ?`
      )
      .all(userId, dayStartIso, dayEndIso) as {
      window_start: string
      window_end: string
      activity_score: number
    }[]

    let weighted = 0
    let totalSec = 0
    for (const row of rows) {
      const ws = new Date(row.window_start).getTime()
      const we = new Date(row.window_end).getTime()
      const a = Math.max(startMs, ws)
      const b = Math.min(endMs, we)
      if (b <= a) continue
      const sec = (b - a) / 1000
      const score = Number(row.activity_score)
      if (!Number.isFinite(score)) continue
      weighted += score * sec
      totalSec += sec
    }

    if (totalSec <= 0) return null
    return Math.min(100, Math.round(weighted / totalSec))
  } catch (err) {
    console.warn('[dayWeightedScore] getWeightedActivityScoreLocalCalendarDay failed:', err)
    return null
  }
}
