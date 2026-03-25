/** Wall-clock overlap of [sessionStart, sessionEnd] with [from, to], in whole seconds. */
export function overlapSeconds(sessionStart: Date, sessionEnd: Date, from: Date, to: Date): number {
  const a = sessionStart.getTime()
  const b = sessionEnd.getTime()
  const f = from.getTime()
  const t = to.getTime()
  const start = Math.max(a, f)
  const end = Math.min(b, t)
  return Math.max(0, Math.floor((end - start) / 1000))
}
