import { startOfDay, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { overlapSeconds } from './time-session-overlap.js'

export type ZonedBucketBounds = {
  todayStart: Date
  yesterdayStart: Date
  yesterdayEnd: Date
  weekStart: Date
  monthStart: Date
}

const dtfCache = new Map<string, boolean>()

export function safeTimeZone(tz: string | null | undefined): string {
  const raw = (tz ?? 'UTC').trim() || 'UTC'
  const hit = dtfCache.get(raw)
  if (hit === true) return raw
  if (hit === false) return 'UTC'
  try {
    Intl.DateTimeFormat(undefined, { timeZone: raw })
    dtfCache.set(raw, true)
    return raw
  } catch {
    dtfCache.set(raw, false)
    return 'UTC'
  }
}

/** Calendar buckets for wall-clock periods in `timeZone` (IANA), returned as UTC `Date` instants. */
export function getZonedBucketBounds(now: Date, timeZone: string): ZonedBucketBounds {
  const tz = safeTimeZone(timeZone)
  const z = toZonedTime(now, tz)
  const todayStart = fromZonedTime(startOfDay(z), tz)
  const yesterdayStart = fromZonedTime(startOfDay(subDays(z, 1)), tz)
  const yesterdayEnd = todayStart
  const weekStart = fromZonedTime(startOfWeek(z, { weekStartsOn: 1 }), tz)
  const monthStart = fromZonedTime(startOfMonth(z), tz)
  return { todayStart, yesterdayStart, yesterdayEnd, weekStart, monthStart }
}

type SessionRow = {
  id: string
  user_id: string
  started_at: Date
  ended_at: Date | null
}

function bucketSecondsMinusDeductions(
  sessionStart: Date,
  sessionEnd: Date,
  bucketStart: Date,
  bucketEnd: Date,
  deds: { range_start: Date; range_end: Date }[]
): number {
  const raw = overlapSeconds(sessionStart, sessionEnd, bucketStart, bucketEnd)
  let sub = 0
  for (const d of deds) {
    sub += overlapSeconds(d.range_start, d.range_end, bucketStart, bucketEnd)
  }
  return Math.max(0, raw - sub)
}

export function aggregateSessionsForUser(args: {
  sessions: SessionRow[]
  userId: string
  now: Date
  bounds: ZonedBucketBounds
  deductionsBySession?: Map<string, { range_start: Date; range_end: Date }[]>
}): {
  today_seconds: number
  yesterday_seconds: number
  this_week_seconds: number
  this_month_seconds: number
  lastInstantMs: number
} {
  const { sessions, userId, now, bounds, deductionsBySession } = args
  const { todayStart, yesterdayStart, yesterdayEnd, weekStart, monthStart } = bounds

  let today = 0
  let yesterday = 0
  let week = 0
  let month = 0
  let lastInstantMs = 0

  for (const s of sessions) {
    if (s.user_id !== userId) continue
    const effectiveEnd = s.ended_at ?? now
    const deds = deductionsBySession?.get(s.id) ?? []

    const t0 = bucketSecondsMinusDeductions(s.started_at, effectiveEnd, todayStart, now, deds)
    const t1 = bucketSecondsMinusDeductions(
      s.started_at,
      effectiveEnd,
      yesterdayStart,
      yesterdayEnd,
      deds
    )
    const t2 = bucketSecondsMinusDeductions(s.started_at, effectiveEnd, weekStart, now, deds)
    const t3 = bucketSecondsMinusDeductions(s.started_at, effectiveEnd, monthStart, now, deds)

    today += t0
    yesterday += t1
    week += t2
    month += t3

    const segLast = Math.max(s.started_at.getTime(), effectiveEnd.getTime())
    if (segLast > lastInstantMs) lastInstantMs = segLast
  }

  return {
    today_seconds: today,
    yesterday_seconds: yesterday,
    this_week_seconds: week,
    this_month_seconds: month,
    lastInstantMs,
  }
}

type OfflineRow = {
  user_id: string
  start_time: Date
  end_time: Date
}

/** Same bucket math as sessions, for manual offline intervals (explicit end). */
export function aggregateOfflineTimeForUser(args: {
  entries: OfflineRow[]
  userId: string
  now: Date
  bounds: ZonedBucketBounds
}): {
  today_seconds: number
  yesterday_seconds: number
  this_week_seconds: number
  this_month_seconds: number
  lastInstantMs: number
} {
  const { entries, userId, now, bounds } = args
  const { todayStart, yesterdayStart, yesterdayEnd, weekStart, monthStart } = bounds

  let today = 0
  let yesterday = 0
  let week = 0
  let month = 0
  let lastInstantMs = 0

  for (const e of entries) {
    if (e.user_id !== userId) continue
    const s = e.start_time
    const en = e.end_time

    today += overlapSeconds(s, en, todayStart, now)
    yesterday += overlapSeconds(s, en, yesterdayStart, yesterdayEnd)
    week += overlapSeconds(s, en, weekStart, now)
    month += overlapSeconds(s, en, monthStart, now)

    const segLast = en.getTime()
    if (segLast > lastInstantMs) lastInstantMs = segLast
  }

  return {
    today_seconds: today,
    yesterday_seconds: yesterday,
    this_week_seconds: week,
    this_month_seconds: month,
    lastInstantMs,
  }
}
