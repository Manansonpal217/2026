import type Database from 'better-sqlite3'

const MAX_STREAK_DAYS = 365

/** Get date string (YYYY-MM-DD) in the given timezone for an ISO date string. */
function toDateStringInTz(isoDate: string, timezone: string): string {
  return new Date(isoDate).toLocaleDateString('en-CA', { timeZone: timezone })
}

/** Get today's date string in the given timezone. */
function getTodayInTz(timezone: string): string {
  return toDateStringInTz(new Date().toISOString(), timezone)
}

/** Get the previous calendar day in the given timezone. */
function prevDayInTz(dateStr: string, timezone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const atNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const prev = new Date(atNoon.getTime() - 24 * 60 * 60 * 1000)
  return toDateStringInTz(prev.toISOString(), timezone)
}

/**
 * Compute streak from local_sessions.
 * Uses device timezone (Intl default) for date bucketing.
 */
export function computeStreakFromLocalSessions(db: Database.Database): number {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - MAX_STREAK_DAYS)
  const cutoffIso = cutoff.toISOString()

  const rows = db
    .prepare(
      `SELECT started_at FROM local_sessions
       WHERE ended_at IS NOT NULL AND duration_sec > 0
       AND started_at >= ?
       ORDER BY started_at DESC`
    )
    .all(cutoffIso) as { started_at: string }[]

  const activeDates = new Set<string>()
  for (const r of rows) {
    activeDates.add(toDateStringInTz(r.started_at, tz))
  }

  if (activeDates.size === 0) return 0

  const today = getTodayInTz(tz)
  const sortedDates = [...activeDates].sort((a, b) => b.localeCompare(a))
  const referenceDate = activeDates.has(today) ? today : sortedDates[0]

  let streak = 0
  let checkDate = referenceDate

  for (let i = 0; i < MAX_STREAK_DAYS; i++) {
    if (activeDates.has(checkDate)) {
      streak++
      checkDate = prevDayInTz(checkDate, tz)
    } else {
      break
    }
  }

  return streak
}
