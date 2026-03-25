import { formatDistanceToNow } from 'date-fns'

/** Strip jira: prefix for display (desktop stores work as `jira:KEY`). */
export function formatNotesForDisplay(notes: string | null | undefined): string {
  if (!notes) return ''
  if (notes.startsWith('jira:')) return notes.slice(5).trim()
  return notes
}

export function formatDurationSeconds(sec: number): string {
  if (sec == null || Number.isNaN(sec) || sec < 0) return '-'
  if (sec === 0) return '0h 00m'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export function formatRelativeFromIso(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatUtcOffsetLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value
    return tz ? `All times are ${tz}` : 'All times are local'
  } catch {
    return 'All times are local'
  }
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/** Monday 00:00 local of the week containing `d`. */
export function startOfLocalWeek(d: Date): Date {
  const day = d.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const x = new Date(d)
  x.setDate(x.getDate() + mondayOffset)
  return startOfLocalDay(x)
}

export function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

/** Sunday 23:59:59.999 local of the week containing `d` (week starts Monday). */
export function endOfLocalWeek(d: Date): Date {
  const start = startOfLocalWeek(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return endOfLocalDay(end)
}

/** Last instant of the calendar month containing `d`. */
export function endOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
