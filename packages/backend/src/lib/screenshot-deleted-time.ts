/** Clip [takenAt, takenAt + interval) to the active session window — one capture window of reported time. */
export function deductionRangeForDeletedScreenshot(args: {
  takenAt: Date
  intervalSeconds: number
  session: { started_at: Date; ended_at: Date | null }
  now: Date
}): { range_start: Date; range_end: Date } | null {
  const { takenAt, intervalSeconds, session, now } = args
  const step = Math.max(1, intervalSeconds)
  const slotEnd = new Date(takenAt.getTime() + step * 1000)
  const sessEnd = session.ended_at ?? now
  const clipStartMs = Math.max(takenAt.getTime(), session.started_at.getTime())
  const clipEndMs = Math.min(slotEnd.getTime(), sessEnd.getTime())
  if (clipEndMs <= clipStartMs) return null
  return { range_start: new Date(clipStartMs), range_end: new Date(clipEndMs) }
}
