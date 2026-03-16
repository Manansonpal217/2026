import { prisma } from '../db/prisma.js'

const MAX_STREAK_DAYS = 365

/**
 * Get date string (YYYY-MM-DD) in the given timezone for a Date.
 */
function toDateStringInTz(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Get today's date string in the given timezone.
 */
function getTodayInTz(timezone: string): string {
  return toDateStringInTz(new Date(), timezone)
}

/**
 * Compute the current streak for a user.
 * Streak = consecutive days (in user timezone) with at least one completed session (duration > 0).
 * If user tracked today → streak includes today.
 * If user has not tracked today → streak = consecutive days ending yesterday.
 */
export async function computeUserStreak(userId: string, timezone: string): Promise<number> {
  const tz = timezone || 'UTC'
  const today = getTodayInTz(tz)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - MAX_STREAK_DAYS)

  const sessions = await prisma.timeSession.findMany({
    where: {
      user_id: userId,
      ended_at: { not: null },
      duration_sec: { gt: 0 },
      started_at: { gte: cutoff },
    },
    select: { ended_at: true },
    orderBy: { started_at: 'desc' },
  })

  const activeDates = new Set<string>()
  for (const s of sessions) {
    activeDates.add(toDateStringInTz(s.ended_at!, tz))
  }

  if (activeDates.size === 0) return 0

  // Reference date: today if active, else most recent active date
  const referenceDate = activeDates.has(today)
    ? today
    : [...activeDates].sort((a, b) => b.localeCompare(a))[0]

  // Count consecutive days backwards from reference (in user timezone)
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

/** Get the previous calendar day in the given timezone. */
function prevDayInTz(dateStr: string, tz: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const atNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const prev = new Date(atNoon.getTime() - 24 * 60 * 60 * 1000)
  return toDateStringInTz(prev, tz)
}
