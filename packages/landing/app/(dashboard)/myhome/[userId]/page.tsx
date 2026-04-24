'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { isAxiosError } from 'axios'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import {
  endOfLocalDay,
  formatDurationSeconds,
  formatNotesForDisplay,
  startOfLocalDay,
} from '@/lib/format'
import { ScreenshotGallery, type ScreenshotItem } from '@/components/ScreenshotGallery'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { buildScreenshotCacheScope, pruneScreenshotCache } from '@/lib/screenshotThumbCache'
import { cn } from '@/lib/utils'

type UserResp = {
  user: {
    id: string
    name: string
    email: string
    role: string
    status: string
    last_active?: string | null
    /** Timer currently running (open session on server). */
    is_tracking?: boolean
    can_add_offline_time?: boolean | null
  }
  expected_daily_work_minutes?: number
  /** Org: when true, employees record own offline without manager approval; when false, requests go to manager. */
  allow_employee_offline_time?: boolean
}

type OfflineTimeRow = {
  id: string
  user_id: string
  requested_by_id: string
  approver_id: string | null
  source: 'REQUEST' | 'DIRECT_ADD'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  start_time: string
  end_time: string
  description: string
  approver_note: string | null
  expires_at: string | null
  created_at: string
}

function offlineStatusKey(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toUpperCase()
}

/** Matches backend aggregates (e.g. team-summary): only approved offline time counts as worked time. */
function offlineCountsTowardWorkedTime(o: OfflineTimeRow): boolean {
  return offlineStatusKey(o.status) === 'APPROVED'
}

function offlineVisibleOnTimeline(o: OfflineTimeRow): boolean {
  const s = offlineStatusKey(o.status)
  return s !== 'REJECTED' && s !== 'EXPIRED'
}

type SessionRow = {
  id: string
  started_at: string
  ended_at: string | null
  duration_sec: number
  notes: string | null
  task?: { id: string; name: string } | null
  project?: { id: string; name: string; color?: string | null } | null
  time_deductions?: { range_start: string; range_end: string }[]
}

/** Task / Apps list: show this many rows before "Show more" (sorted by time, descending). */
const ROLLUP_PREVIEW_LIMIT = 4

/** Label for work tracked in the desktop app: Jira/task name, notes (e.g. PROJ-123 …), or project. */
function sessionWorkLabel(s: SessionRow): string {
  const taskName = s.task?.name?.trim()
  if (taskName) {
    return s.project?.name ? `${s.project.name} · ${taskName}` : taskName
  }
  const notes = s.notes?.trim()
  if (notes) {
    const display = formatNotesForDisplay(notes)
    return display || notes
  }
  if (s.project?.name) return s.project.name
  return 'No task'
}

/** Normalize API payloads (snake_case from Prisma; tolerate camelCase if serializers change). */
function normalizeSessionRow(raw: unknown): SessionRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = r.id != null ? String(r.id) : ''
  if (!id) return null
  const started =
    r.started_at != null ? String(r.started_at) : r.startedAt != null ? String(r.startedAt) : ''
  const ended =
    r.ended_at != null ? String(r.ended_at) : r.endedAt != null ? String(r.endedAt) : null
  const durationRaw = r.duration_sec ?? r.durationSec
  const duration_sec =
    typeof durationRaw === 'number' && !Number.isNaN(durationRaw)
      ? durationRaw
      : Number(durationRaw) || 0
  const notes = r.notes != null && r.notes !== '' ? String(r.notes) : null
  const project = (r.project ?? null) as SessionRow['project']
  const task = (r.task ?? null) as SessionRow['task']
  let time_deductions: SessionRow['time_deductions']
  const tdRaw = r.time_deductions
  if (Array.isArray(tdRaw)) {
    const parsed = tdRaw
      .map((x) => {
        if (!x || typeof x !== 'object') return null
        const o = x as Record<string, unknown>
        const rs =
          o.range_start != null
            ? String(o.range_start)
            : o.rangeStart != null
              ? String(o.rangeStart)
              : ''
        const re =
          o.range_end != null ? String(o.range_end) : o.rangeEnd != null ? String(o.rangeEnd) : ''
        if (!rs || !re) return null
        return { range_start: rs, range_end: re }
      })
      .filter((x): x is { range_start: string; range_end: string } => x != null)
    if (parsed.length > 0) time_deductions = parsed
  }
  return {
    id,
    started_at: started,
    ended_at: ended,
    duration_sec,
    notes,
    project: project && typeof project === 'object' ? project : null,
    task: task && typeof task === 'object' ? task : null,
    time_deductions,
  }
}

function mergeDeductionIntervalsForSession(
  ranges: { range_start: string; range_end: string }[],
  sessionStartMs: number,
  sessionEndMs: number
): [number, number][] {
  const clipped = ranges
    .map((d) => ({
      a: Math.max(sessionStartMs, new Date(d.range_start).getTime()),
      b: Math.min(sessionEndMs, new Date(d.range_end).getTime()),
    }))
    .filter((x) => x.b > x.a)
    .sort((x, y) => x.a - y.a)
  const merged: [number, number][] = []
  for (const cur of clipped) {
    const last = merged[merged.length - 1]
    if (!last || cur.a > last[1]) merged.push([cur.a, cur.b])
    else last[1] = Math.max(last[1], cur.b)
  }
  return merged
}

function expandSessionsAfterTimeDeductions(sessions: SessionRow[], nowMs: number): SessionRow[] {
  const out: SessionRow[] = []
  for (const s of sessions) {
    const deds = s.time_deductions
    if (!deds?.length) {
      out.push(s)
      continue
    }
    const S = new Date(s.started_at).getTime()
    const E = s.ended_at ? new Date(s.ended_at).getTime() : nowMs
    const merged = mergeDeductionIntervalsForSession(deds, S, E)
    let cursor = S
    for (const [ds, de] of merged) {
      if (ds > cursor) {
        const segEnd = Math.min(ds, E)
        const { time_deductions: _t, ...base } = s
        out.push({
          ...base,
          started_at: new Date(cursor).toISOString(),
          ended_at: new Date(segEnd).toISOString(),
          duration_sec: Math.max(0, Math.floor((segEnd - cursor) / 1000)),
        })
      }
      cursor = Math.max(cursor, de)
    }
    if (cursor < E) {
      const { time_deductions: _t, ...base } = s
      out.push({
        ...base,
        started_at: new Date(cursor).toISOString(),
        ended_at: s.ended_at === null && E >= nowMs ? null : new Date(E).toISOString(),
        duration_sec: Math.max(0, Math.floor((E - cursor) / 1000)),
      })
    }
  }
  return out
}

function sessionRollupKey(s: SessionRow): string {
  if (s.task?.id) return `task:${s.task.id}`
  const notes = s.notes?.trim() ?? ''
  if (notes) return `note:${notes}`
  if (s.project?.id) return `proj:${s.project.id}`
  return '_none'
}

type ActivityLogRow = {
  window_start: string
  window_end: string
  active_app: string | null
  active_url: string | null
  activity_score: number
}

function activityLabelFromLog(log: ActivityLogRow): string {
  return [log.active_app, log.active_url].filter(Boolean).join(' — ') || 'Unknown'
}

/** Time-weighted mean activity_score (0–100) for logs overlapping [rangeStart, rangeEnd] (ms). */
function weightedActivityScoreForRange(
  logs: ActivityLogRow[],
  rangeStart: number,
  rangeEnd: number
): number | null {
  let weighted = 0
  let totalSec = 0
  for (const log of logs) {
    const ws = new Date(log.window_start).getTime()
    const we = new Date(log.window_end).getTime()
    const a = Math.max(rangeStart, ws)
    const b = Math.min(rangeEnd, we)
    if (b <= a) continue
    const sec = (b - a) / 1000
    const score = Number(log.activity_score)
    if (!Number.isFinite(score)) continue
    weighted += score * sec
    totalSec += sec
  }
  if (totalSec <= 0) return null
  return weighted / totalSec
}

const POLL_MS = 15_000

function isMgmtRole(role: string | undefined): boolean {
  const r = role ?? 'employee'
  return r === 'super_admin' || r === 'admin' || r === 'manager'
}

/** Merge back-to-back segments (idle auto-stop/restart, task switches) into one visible block. */
const DISPLAY_MERGE_GAP_MS = 3 * 60 * 1000
/** Drop clipped segments shorter than this so empty “13:03–13:03” rows disappear. */
const MIN_CLIPPED_SEGMENT_MS = 5_000
/** Progress fill: width = logged / org daily target; uses theme primary (not selection emerald). */
const DAY_LOGGED_FILL_CLASS = 'bg-primary'

function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysInMonth(year: number, month: number): Date[] {
  const last = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: last }, (_, i) => new Date(year, month, i + 1))
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const HOURS_24 = Array.from({ length: 24 }, (_, h) => h)

/** Compact label for local hour h (0 = midnight, 12 = noon). */
function hourSlotLabel(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

function hourSlotTitle(h: number): string {
  return new Date(2020, 0, 1, h, 0, 0).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function sessionClippedRangeOnDay(
  s: SessionRow,
  day: Date,
  nowMs: number
): { clipStart: number; clipEnd: number } | null {
  const dayStart = startOfLocalDay(day).getTime()
  const dayEnd = endOfLocalDay(day).getTime()
  const start = new Date(s.started_at).getTime()
  let end: number
  if (s.ended_at) {
    end = new Date(s.ended_at).getTime()
  } else if (isSameLocalDay(day, new Date())) {
    end = Math.min(dayEnd, nowMs)
  } else {
    end = Math.min(dayEnd, start + Math.max(s.duration_sec, 0) * 1000)
  }
  const clipStart = Math.max(start, dayStart)
  const clipEnd = Math.min(end, dayEnd)
  if (clipEnd <= clipStart) return null
  return { clipStart, clipEnd }
}

/** Total tracked seconds per calendar day (local), summed from session clips. */
function computeDayLoggedSecondsRecord(
  monthSessions: SessionRow[],
  days: Date[],
  nowMs: number
): Record<string, number> {
  const record: Record<string, number> = {}
  for (const day of days) {
    const key = localDayKey(day)
    let total = 0
    for (const s of monthSessions) {
      const r = sessionClippedRangeOnDay(s, day, nowMs)
      if (r) total += (r.clipEnd - r.clipStart) / 1000
    }
    if (total > 0) record[key] = total
  }
  return record
}

function offlineClippedRangeOnDay(
  o: OfflineTimeRow,
  day: Date
): { clipStart: number; clipEnd: number } | null {
  const dayStart = startOfLocalDay(day).getTime()
  const dayEnd = endOfLocalDay(day).getTime()
  const start = new Date(o.start_time).getTime()
  const end = new Date(o.end_time).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const clipStart = Math.max(start, dayStart)
  const clipEnd = Math.min(end, dayEnd)
  if (clipEnd <= clipStart) return null
  return { clipStart, clipEnd }
}

/** Offline seconds per calendar day (local). */
function computeDayOfflineSecondsRecord(
  entries: OfflineTimeRow[],
  days: Date[]
): Record<string, number> {
  const record: Record<string, number> = {}
  for (const day of days) {
    const key = localDayKey(day)
    let total = 0
    for (const o of entries) {
      const r = offlineClippedRangeOnDay(o, day)
      if (r) total += (r.clipEnd - r.clipStart) / 1000
    }
    if (total > 0) record[key] = total
  }
  return record
}

function localDayAndTimeToISO(day: Date, hhmm: string): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10))
  const d = startOfLocalDay(day)
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return d.toISOString()
}

type DisplaySessionGroup = {
  key: string
  clipStart: number
  clipEnd: number
  members: SessionRow[]
}

type TimelineRow =
  | { kind: 'session'; group: DisplaySessionGroup }
  | {
      kind: 'offline'
      entry: OfflineTimeRow
      clipStart: number
      clipEnd: number
    }

/** Hour-lane blocks for offline rows already clipped to `day` (same geometry as the detail list). */
function offlineHourBarBlocksFromTimelineRows(
  rows: TimelineRow[],
  day: Date,
  includeEntry: (entry: OfflineTimeRow) => boolean
): { left: number; width: number; key: string }[] {
  const dayStart = startOfLocalDay(day).getTime()
  const dayEnd = endOfLocalDay(day).getTime()
  const dayMs = dayEnd - dayStart + 1
  const out: { left: number; width: number; key: string }[] = []
  for (const row of rows) {
    if (row.kind !== 'offline') continue
    if (!includeEntry(row.entry)) continue
    const { clipStart, clipEnd } = row
    if (clipEnd - clipStart < MIN_CLIPPED_SEGMENT_MS) continue
    const left = ((clipStart - dayStart) / dayMs) * 100
    const width = ((clipEnd - clipStart) / dayMs) * 100
    if (!Number.isFinite(left) || !Number.isFinite(width)) continue
    out.push({ key: row.entry.id, left, width })
  }
  return out
}

/** One UI block per continuous work period; gaps (no tracking) produce no row. */
function buildDisplaySessionGroups(
  sessions: SessionRow[],
  day: Date,
  nowMs: number
): DisplaySessionGroup[] {
  const clipped: { row: SessionRow; clipStart: number; clipEnd: number }[] = []
  for (const s of sessions) {
    const r = sessionClippedRangeOnDay(s, day, nowMs)
    if (!r) continue
    if (r.clipEnd - r.clipStart < MIN_CLIPPED_SEGMENT_MS) continue
    clipped.push({ row: s, ...r })
  }
  clipped.sort((a, b) => a.clipStart - b.clipStart)

  const groups: DisplaySessionGroup[] = []
  for (const c of clipped) {
    const prev = groups[groups.length - 1]
    const lastInPrev = prev?.members[prev.members.length - 1]
    const sameTaskPartition =
      lastInPrev != null && sessionRollupKey(lastInPrev) === sessionRollupKey(c.row)
    const withinMergeGap = prev != null && c.clipStart - prev.clipEnd <= DISPLAY_MERGE_GAP_MS
    if (prev != null && withinMergeGap && sameTaskPartition) {
      prev.members.push(c.row)
      prev.clipStart = Math.min(prev.clipStart, c.clipStart)
      prev.clipEnd = Math.max(prev.clipEnd, c.clipEnd)
    } else {
      groups.push({
        key: c.row.id,
        clipStart: c.clipStart,
        clipEnd: c.clipEnd,
        members: [c.row],
      })
    }
  }
  for (const g of groups) {
    g.key = g.members.map((m) => m.id).join('|')
  }
  return groups
}

function sessionBlocksFromGroups(
  groups: DisplaySessionGroup[],
  day: Date
): { left: number; width: number; key: string }[] {
  const dayStart = startOfLocalDay(day).getTime()
  const dayEnd = endOfLocalDay(day).getTime()
  const dayMs = dayEnd - dayStart + 1
  return groups.map((g) => ({
    key: g.key,
    left: ((g.clipStart - dayStart) / dayMs) * 100,
    width: ((g.clipEnd - g.clipStart) / dayMs) * 100,
  }))
}

function mergedGroupTaskLabel(group: DisplaySessionGroup): string | null {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const s of group.members) {
    const line = sessionWorkLabel(s)
    if (seen.has(line)) continue
    seen.add(line)
    labels.push(line)
  }
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]
  return labels.join(' · ')
}

export default function UserHomePage() {
  const params = useParams()
  const rawId = params?.userId
  const userId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? (rawId[0] ?? '') : ''

  const { data: session, status: sessionStatus } = useSession()
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id
  const sessionRole = (session?.user as { role?: string } | undefined)?.role

  const [user, setUser] = useState<UserResp['user'] | null>(null)
  const [userErr, setUserErr] = useState<string | null>(null)

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(new Date()))

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [offlineTimes, setOfflineTimes] = useState<OfflineTimeRow[]>([])
  const [offlineEntriesMonth, setOfflineEntriesMonth] = useState<OfflineTimeRow[]>([])
  const [employeeOfflineSelfService, setEmployeeOfflineSelfService] = useState(false)
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** When true, day fetch toggles full-page loading and unmounts session rows (bad for polls). */
  const blockUiUntilDayHydratedRef = useRef(true)
  const [dayLoggedSecondsRecord, setDayLoggedSecondsRecord] = useState<Record<string, number>>({})
  const [expectedDailyWorkMinutes, setExpectedDailyWorkMinutes] = useState(480)

  const [rollupExpandedTasks, setRollupExpandedTasks] = useState(false)
  const [rollupExpandedApps, setRollupExpandedApps] = useState(false)
  const [dailyRollupTab, setDailyRollupTab] = useState<'tasks' | 'apps'>('tasks')

  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [historyInfoOpen, setHistoryInfoOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [offlineSubmitErr, setOfflineSubmitErr] = useState<string | null>(null)
  const [offlineSubmitting, setOfflineSubmitting] = useState(false)
  const [offlineFormStart, setOfflineFormStart] = useState('09:00')
  const [offlineFormEnd, setOfflineFormEnd] = useState('17:00')
  const [offlineFormDescription, setOfflineFormDescription] = useState('')
  const [offlineDeleteId, setOfflineDeleteId] = useState<string | null>(null)

  const selectedIsToday = isSameLocalDay(selectedDay, new Date())

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!offlineModalOpen && !historyInfoOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOfflineModalOpen(false)
        setHistoryInfoOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offlineModalOpen, historyInfoOpen])

  useEffect(() => {
    setRollupExpandedTasks(false)
    setRollupExpandedApps(false)
    setDailyRollupTab('tasks')
  }, [selectedDay, userId])

  const screenshotCacheScope = useMemo(() => {
    if (!sessionUserId || !userId) return ''
    return buildScreenshotCacheScope(sessionUserId, userId, selectedDay)
  }, [sessionUserId, userId, selectedDay])

  const screenshotIdsFingerprint = useMemo(
    () =>
      screenshots.length === 0
        ? ''
        : [...screenshots]
            .map((s) => s.id)
            .sort()
            .join(','),
    [screenshots]
  )

  useEffect(() => {
    if (!screenshotCacheScope) return
    const validIds =
      screenshotIdsFingerprint === ''
        ? new Set<string>()
        : new Set(screenshotIdsFingerprint.split(','))
    void pruneScreenshotCache(screenshotCacheScope, validIds)
  }, [screenshotCacheScope, screenshotIdsFingerprint])

  useEffect(() => {
    blockUiUntilDayHydratedRef.current = true
  }, [userId, selectedDay])

  const loadDayData = useCallback(async () => {
    if (!userId || !user) return
    const from = startOfLocalDay(selectedDay).toISOString()
    const to = endOfLocalDay(selectedDay).toISOString()

    const errMessage = (e: unknown) => {
      if (e instanceof Error) return e.message
      if (isAxiosError(e)) {
        const m = (e.response?.data as { message?: string } | undefined)?.message?.trim()
        return m || e.message
      }
      return 'Request failed'
    }

    const blockUi = blockUiUntilDayHydratedRef.current
    if (blockUi) setLoading(true)
    setLoadErr(null)

    const [sessOut, ssOut, actOut, offOut] = await Promise.allSettled([
      api.get<{ sessions: SessionRow[] }>('/v1/sessions', {
        params: { user_id: userId, from, to, limit: 200 },
      }),
      api.get<{ screenshots: ScreenshotItem[] }>('/v1/screenshots/', {
        params: { user_id: userId, from, to, limit: 100 },
      }),
      api.get<{ activity_logs: ActivityLogRow[] }>('/v1/reports/activity', {
        params: { user_id: userId, from, to, limit: 500 },
      }),
      api.get<{ offline_time: OfflineTimeRow[] }>('/v1/app/offline-time', {
        params: { user_id: userId, from, to },
      }),
    ])

    if (sessOut.status !== 'fulfilled') {
      setSessions([])
      setScreenshots([])
      setActivityLogs([])
      setOfflineTimes([])
      setLoadErr(errMessage(sessOut.reason))
      blockUiUntilDayHydratedRef.current = false
      setLoading(false)
      return
    }

    const rawSessions = sessOut.value.data.sessions ?? []
    setSessions(rawSessions.map(normalizeSessionRow).filter((x): x is SessionRow => x != null))

    if (ssOut.status === 'fulfilled') {
      setScreenshots(ssOut.value.data.screenshots ?? [])
    } else {
      setScreenshots([])
    }

    // Activity report requires REPORTS_VIEW; sessions list does not — do not fail the whole day view.
    if (actOut.status === 'fulfilled') {
      setActivityLogs(actOut.value.data.activity_logs ?? [])
    } else {
      setActivityLogs([])
    }

    if (offOut.status === 'fulfilled') {
      setOfflineTimes(offOut.value.data.offline_time ?? [])
    } else {
      setOfflineTimes([])
      setLoadErr(errMessage(offOut.reason))
    }

    blockUiUntilDayHydratedRef.current = false
    setLoading(false)
  }, [userId, user, selectedDay])

  const loadMonthMarkers = useCallback(async () => {
    if (!userId || !user) return
    const monthFirst = startOfLocalDay(new Date(viewYear, viewMonth, 1))
    const monthLast = endOfLocalDay(new Date(viewYear, viewMonth + 1, 0))
    const PAGE_SIZE = 200 // must match API max
    try {
      const allSessions: SessionRow[] = []
      for (let page = 1; page <= 40; page++) {
        const { data } = await api.get<{ sessions: SessionRow[] }>('/v1/sessions', {
          params: {
            user_id: userId,
            from: monthFirst.toISOString(),
            to: monthLast.toISOString(),
            limit: PAGE_SIZE,
            page,
          },
        })
        const batch = (data.sessions ?? [])
          .map(normalizeSessionRow)
          .filter((x): x is SessionRow => x != null)
          .flatMap((row) => expandSessionsAfterTimeDeductions([row], Date.now()))
        allSessions.push(...batch)
        if (batch.length < PAGE_SIZE) break
      }
      const { data: offData } = await api.get<{ offline_time: OfflineTimeRow[] }>(
        '/v1/app/offline-time',
        {
          params: {
            user_id: userId,
            from: monthFirst.toISOString(),
            to: monthLast.toISOString(),
          },
        }
      )
      const days = daysInMonth(viewYear, viewMonth)
      setDayLoggedSecondsRecord(computeDayLoggedSecondsRecord(allSessions, days, Date.now()))
      setOfflineEntriesMonth(offData.offline_time ?? [])
    } catch {
      /* keep previous markers */
    }
  }, [userId, user, viewYear, viewMonth])

  useEffect(() => {
    void loadMonthMarkers()
  }, [loadMonthMarkers])

  useEffect(() => {
    if (!userId) return
    if (sessionStatus === 'loading') return

    if (
      sessionStatus === 'authenticated' &&
      sessionUserId &&
      !isMgmtRole(sessionRole) &&
      sessionUserId !== userId
    ) {
      setUserErr('unavailable')
      setUser(null)
      setLoading(false)
      return
    }

    setLoading(true)
    void (async () => {
      try {
        setUserErr(null)
        const { data } = await api.get<UserResp>(`/v1/users/${userId}`)
        setUser(data.user)
        setExpectedDailyWorkMinutes(data.expected_daily_work_minutes ?? 480)
        setEmployeeOfflineSelfService(data.allow_employee_offline_time ?? false)
      } catch (e) {
        if (isAxiosError(e)) {
          const status = e.response?.status
          const msg = (e.response?.data as { message?: string } | undefined)?.message
          if (status === 403 || status === 404) {
            setUserErr('unavailable')
          } else {
            setUserErr(
              msg?.trim() || 'Could not load this user. Try again or return to the user list.'
            )
          }
        } else {
          setUserErr(
            'Could not reach the API. Check NEXT_PUBLIC_API_URL and that the backend is running.'
          )
        }
        setUser(null)
        setLoading(false)
      }
    })()
  }, [userId, sessionStatus, sessionUserId, sessionRole])

  useEffect(() => {
    if (!userId || sessionStatus !== 'authenticated') return
    const tick = () => {
      void api
        .get<UserResp>(`/v1/users/${userId}`)
        .then(({ data }) => {
          setUser(data.user)
          setExpectedDailyWorkMinutes(data.expected_daily_work_minutes ?? 480)
          setEmployeeOfflineSelfService(data.allow_employee_offline_time ?? false)
        })
        .catch(() => {})
    }
    const id = window.setInterval(tick, POLL_MS)
    return () => window.clearInterval(id)
  }, [userId, sessionStatus])

  useEffect(() => {
    if (!userId || !user) return
    void loadDayData()
  }, [userId, user, loadDayData])

  useEffect(() => {
    if (!selectedIsToday) return
    const id = window.setInterval(() => void loadDayData(), POLL_MS)
    return () => window.clearInterval(id)
  }, [selectedIsToday, loadDayData])

  useEffect(() => {
    if (!selectedIsToday) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadDayData()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [selectedIsToday, loadDayData])

  const viewingCurrentMonth = useMemo(() => {
    const t = new Date()
    return viewYear === t.getFullYear() && viewMonth === t.getMonth()
  }, [viewYear, viewMonth])

  useEffect(() => {
    if (!userId || !user || !viewingCurrentMonth) return
    const id = window.setInterval(() => void loadMonthMarkers(), POLL_MS)
    return () => window.clearInterval(id)
  }, [userId, user, viewingCurrentMonth, loadMonthMarkers])

  const calendarDays = useMemo(() => daysInMonth(viewYear, viewMonth), [viewYear, viewMonth])

  const expectedSecondsPerDay = Math.max(
    60,
    (expectedDailyWorkMinutes > 0 ? expectedDailyWorkMinutes : 480) * 60
  )

  const sessionsForTimeline = useMemo(
    () => expandSessionsAfterTimeDeductions(sessions, Date.now()),
    [sessions]
  )

  /** Matches timeline/task list: clipped local-day seconds from loaded sessions (includes pending when org uses time approval). */
  const clippedSessionDaySeconds = useMemo(() => {
    const nowMs = Date.now()
    let t = 0
    for (const s of sessionsForTimeline) {
      const r = sessionClippedRangeOnDay(s, selectedDay, nowMs)
      if (r) t += (r.clipEnd - r.clipStart) / 1000
    }
    return Math.round(t)
  }, [sessionsForTimeline, selectedDay])

  const sessionsChrono = useMemo(
    () =>
      [...sessionsForTimeline].sort(
        (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      ),
    [sessionsForTimeline]
  )

  const displayGroups = useMemo(
    () => buildDisplaySessionGroups(sessionsForTimeline, selectedDay, Date.now()),
    [sessionsForTimeline, selectedDay]
  )

  const blocks = useMemo(
    () => sessionBlocksFromGroups(displayGroups, selectedDay),
    [displayGroups, selectedDay]
  )

  const timelineRows = useMemo((): TimelineRow[] => {
    const rows: TimelineRow[] = []
    for (const g of displayGroups) rows.push({ kind: 'session', group: g })
    for (const o of offlineTimes) {
      if (!offlineVisibleOnTimeline(o)) continue
      const r = offlineClippedRangeOnDay(o, selectedDay)
      if (!r || r.clipEnd - r.clipStart < MIN_CLIPPED_SEGMENT_MS) continue
      rows.push({ kind: 'offline', entry: o, clipStart: r.clipStart, clipEnd: r.clipEnd })
    }
    rows.sort((a, b) => {
      const sa = a.kind === 'session' ? a.group.clipStart : a.clipStart
      const sb = b.kind === 'session' ? b.group.clipStart : b.clipStart
      return sa - sb
    })
    return rows
  }, [displayGroups, offlineTimes, selectedDay])

  /** Gradient paints below session bars; avoids abs children sitting under the track fill in some stacks. */
  const approvedOfflineDayLaneGradient = useMemo(() => {
    const dayStart = startOfLocalDay(selectedDay).getTime()
    const dayEnd = endOfLocalDay(selectedDay).getTime()
    const dayMs = dayEnd - dayStart + 1
    const layers: string[] = []
    for (const o of offlineTimes) {
      if (!offlineCountsTowardWorkedTime(o)) continue
      const r = offlineClippedRangeOnDay(o, selectedDay)
      if (!r || r.clipEnd - r.clipStart < MIN_CLIPPED_SEGMENT_MS) continue
      const left = ((r.clipStart - dayStart) / dayMs) * 100
      const width = ((r.clipEnd - r.clipStart) / dayMs) * 100
      if (!Number.isFinite(left) || !Number.isFinite(width)) continue
      const l = Math.max(0, Math.min(100, left))
      const rPct = Math.max(l, Math.min(100, l + Math.max(width, 0.12)))
      layers.push(
        `linear-gradient(to right, transparent ${l}%, rgb(249 115 22 / 0.92) ${l}%, rgb(249 115 22 / 0.92) ${rPct}%, transparent ${rPct}%)`
      )
    }
    return layers.length > 0 ? layers.join(', ') : undefined
  }, [offlineTimes, selectedDay])

  const pendingOfflineBarBlocks = useMemo(
    () =>
      offlineHourBarBlocksFromTimelineRows(
        timelineRows,
        selectedDay,
        (e) => offlineStatusKey(e.status) === 'PENDING'
      ),
    [timelineRows, selectedDay]
  )

  const offlineDaySeconds = useMemo(() => {
    let t = 0
    for (const o of offlineTimes) {
      if (!offlineCountsTowardWorkedTime(o)) continue
      const r = offlineClippedRangeOnDay(o, selectedDay)
      if (r) t += (r.clipEnd - r.clipStart) / 1000
    }
    return Math.round(t)
  }, [offlineTimes, selectedDay])

  /** Pending requests are visible in the detail list but do not count toward totals (matches team-summary / payroll). */
  const pendingOfflineDaySeconds = useMemo(() => {
    let t = 0
    for (const o of offlineTimes) {
      if (offlineStatusKey(o.status) !== 'PENDING') continue
      const r = offlineClippedRangeOnDay(o, selectedDay)
      if (r) t += (r.clipEnd - r.clipStart) / 1000
    }
    return Math.round(t)
  }, [offlineTimes, selectedDay])

  const dayOfflineFromMonth = useMemo(() => {
    const days = daysInMonth(viewYear, viewMonth)
    const approvedOnly = offlineEntriesMonth.filter(offlineCountsTowardWorkedTime)
    return computeDayOfflineSecondsRecord(approvedOnly, days)
  }, [offlineEntriesMonth, viewYear, viewMonth])

  /** Merge API day total for selected day (authoritative) with month session + offline sums. */
  const calendarDayLoggedSeconds = useMemo(() => {
    const keys = new Set([
      ...Object.keys(dayLoggedSecondsRecord),
      ...Object.keys(dayOfflineFromMonth),
    ])
    const out: Record<string, number> = {}
    for (const k of keys) {
      out[k] = (dayLoggedSecondsRecord[k] ?? 0) + (dayOfflineFromMonth[k] ?? 0)
    }
    if (selectedDay.getFullYear() === viewYear && selectedDay.getMonth() === viewMonth) {
      const k = localDayKey(selectedDay)
      out[k] = Math.max(out[k] ?? 0, clippedSessionDaySeconds + offlineDaySeconds)
    }
    return out
  }, [
    dayLoggedSecondsRecord,
    dayOfflineFromMonth,
    clippedSessionDaySeconds,
    offlineDaySeconds,
    selectedDay,
    viewYear,
    viewMonth,
  ])

  const canAddOfflineTime = useMemo(() => {
    if (isMgmtRole(sessionRole) && user) return true
    if (sessionUserId !== userId) return false
    if (user?.can_add_offline_time === false) return false
    return true
  }, [sessionRole, sessionUserId, userId, user])

  /** Mirrors backend self-service: immediate own entry when org allows or user override is on. */
  const employeeStyleMayAddOwnOffline = useMemo(() => {
    if (sessionUserId !== userId || !user) return false
    const o = user.can_add_offline_time
    if (o === true) return true
    if (o === false) return false
    return employeeOfflineSelfService === true
  }, [sessionUserId, userId, user, employeeOfflineSelfService])

  /** Own day view or managers/admins adding for someone they can access. */
  const showOfflineTimeFooterLink = useMemo(() => {
    if (!user) return false
    return Boolean(sessionUserId === userId || canAddOfflineTime)
  }, [user, sessionUserId, userId, canAddOfflineTime])

  const offlineSubmitBlocked = sessionUserId === userId && user?.can_add_offline_time === false

  /** Manager adding for someone else uses direct-add; self uses /request (pending unless admin/owner or self-service). */
  const viewingOtherUserForOffline = Boolean(sessionUserId && userId && sessionUserId !== userId)
  const offlineSelfImmediateApproval =
    !viewingOtherUserForOffline &&
    (sessionRole === 'admin' ||
      sessionRole === 'super_admin' ||
      ((sessionRole === 'manager' || sessionRole === 'employee' || sessionRole === 'viewer') &&
        employeeStyleMayAddOwnOffline))
  const offlineModalUsesRequestFlow = !viewingOtherUserForOffline && !offlineSelfImmediateApproval

  const offlineModalTitle = viewingOtherUserForOffline
    ? 'Add offline time'
    : offlineSelfImmediateApproval
      ? 'Add offline time'
      : 'Request offline time'

  const offlineModalExplainer = viewingOtherUserForOffline
    ? `Adds approved manual time for ${user?.name ?? 'this person'} on the selected day.`
    : offlineSelfImmediateApproval
      ? 'This entry is saved to your timesheet immediately.'
      : 'This is sent for approval before it appears on your timesheet.'

  const canDeleteOfflineEntry = useCallback(
    (_entry: OfflineTimeRow) => {
      if (isMgmtRole(sessionRole) && user) return true
      if (sessionUserId !== userId) return false
      return user?.can_add_offline_time !== false
    },
    [sessionRole, sessionUserId, userId, user]
  )

  const taskRollup = useMemo(() => {
    const nowMs = Date.now()
    const map = new Map<string, { name: string; seconds: number }>()
    for (const s of sessionsChrono) {
      const clip = sessionClippedRangeOnDay(s, selectedDay, nowMs)
      if (!clip) continue
      const dur = (clip.clipEnd - clip.clipStart) / 1000
      if (dur <= 0) continue
      const key = sessionRollupKey(s)
      const name = sessionWorkLabel(s)
      const row = map.get(key) ?? { name, seconds: 0 }
      row.seconds += dur
      map.set(key, row)
    }
    for (const o of offlineTimes) {
      if (!offlineCountsTowardWorkedTime(o)) continue
      const clip = offlineClippedRangeOnDay(o, selectedDay)
      if (!clip) continue
      const dur = (clip.clipEnd - clip.clipStart) / 1000
      if (dur <= 0) continue
      const key = `offline:${o.id}`
      const name = o.description?.trim() || 'Offline / manual time'
      const row = map.get(key) ?? { name, seconds: 0 }
      row.seconds += dur
      map.set(key, row)
    }
    return [...map.entries()].sort((a, b) => b[1].seconds - a[1].seconds)
  }, [sessionsChrono, offlineTimes, selectedDay])

  const appRollup = useMemo(() => {
    const dayStart = startOfLocalDay(selectedDay).getTime()
    const dayEnd = endOfLocalDay(selectedDay).getTime()
    const map = new Map<string, number>()
    for (const log of activityLogs) {
      const ws = new Date(log.window_start).getTime()
      const we = new Date(log.window_end).getTime()
      const a = Math.max(dayStart, ws)
      const b = Math.min(dayEnd, we)
      if (b <= a) continue
      const sec = (b - a) / 1000
      const label = activityLabelFromLog(log)
      map.set(label, (map.get(label) ?? 0) + sec)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [activityLogs, selectedDay])

  const dayActivityScorePct = useMemo(() => {
    const ds = startOfLocalDay(selectedDay).getTime()
    const de = endOfLocalDay(selectedDay).getTime()
    const raw = weightedActivityScoreForRange(activityLogs, ds, de)
    return raw != null ? Math.round(raw) : null
  }, [activityLogs, selectedDay])

  /** Server enforces scope (e.g. managers: direct reports only). Hide controls until profile loads. */
  const canManageScreenshots = isMgmtRole(sessionRole) && Boolean(user)

  const handleScreenshotBlur = useCallback(async (id: string) => {
    await api.post(`/v1/screenshots/${id}/blur`)
    setScreenshots((prev) => prev.map((s) => (s.id === id ? { ...s, is_blurred: true } : s)))
  }, [])

  const handleScreenshotDelete = useCallback(async (id: string) => {
    await api.delete(`/v1/screenshots/${id}`)
    setScreenshots((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const executeDeleteOffline = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/v1/app/offline-time/${id}`)
        setOfflineTimes((prev) => prev.filter((x) => x.id !== id))
        setOfflineEntriesMonth((prev) => prev.filter((x) => x.id !== id))
        void loadMonthMarkers()
        setLoadErr(null)
      } catch (e: unknown) {
        let msg = 'Could not delete offline time. Is the API running and reachable?'
        if (isAxiosError(e)) {
          const m = (e.response?.data as { message?: string } | undefined)?.message
          if (m && m.trim()) msg = m.trim()
          else if (e.code === 'ERR_NETWORK') {
            msg =
              'Network error — check NEXT_PUBLIC_API_URL and that the backend is running (e.g. http://localhost:3001).'
          }
        }
        setLoadErr(msg)
      }
    },
    [loadMonthMarkers]
  )

  const submitOfflineTime = useCallback(async () => {
    const desc = offlineFormDescription.trim()
    if (!desc) {
      setOfflineSubmitErr('Description is required')
      return
    }
    const startMs = new Date(localDayAndTimeToISO(selectedDay, offlineFormStart)).getTime()
    const endMs = new Date(localDayAndTimeToISO(selectedDay, offlineFormEnd)).getTime()
    if (!(endMs > startMs)) {
      setOfflineSubmitErr('End time must be after start time')
      return
    }
    setOfflineSubmitting(true)
    setOfflineSubmitErr(null)
    try {
      const isSelf = sessionUserId === userId
      const endpoint = isSelf ? '/v1/app/offline-time/request' : '/v1/app/offline-time/direct-add'
      const body = isSelf
        ? {
            start_time: localDayAndTimeToISO(selectedDay, offlineFormStart),
            end_time: localDayAndTimeToISO(selectedDay, offlineFormEnd),
            description: desc,
          }
        : {
            user_id: userId,
            start_time: localDayAndTimeToISO(selectedDay, offlineFormStart),
            end_time: localDayAndTimeToISO(selectedDay, offlineFormEnd),
            description: desc,
          }
      await api.post(endpoint, body)
      setOfflineModalOpen(false)
      setOfflineFormDescription('')
      void loadDayData()
      void loadMonthMarkers()
    } catch (e: unknown) {
      let errText = 'Could not save offline time'
      if (isAxiosError(e)) {
        const m = (e.response?.data as { message?: string } | undefined)?.message
        if (m && m.trim()) errText = m.trim()
      } else if (e instanceof Error && e.message) {
        errText = e.message
      }
      setOfflineSubmitErr(errText)
    } finally {
      setOfflineSubmitting(false)
    }
  }, [
    offlineFormDescription,
    offlineFormEnd,
    offlineFormStart,
    selectedDay,
    userId,
    sessionUserId,
    loadDayData,
    loadMonthMarkers,
  ])

  const visibleTasks = rollupExpandedTasks ? taskRollup : taskRollup.slice(0, ROLLUP_PREVIEW_LIMIT)
  const visibleApps = rollupExpandedApps ? appRollup : appRollup.slice(0, ROLLUP_PREVIEW_LIMIT)
  const tasksRollupHasMore = taskRollup.length > ROLLUP_PREVIEW_LIMIT
  const appsRollupHasMore = appRollup.length > ROLLUP_PREVIEW_LIMIT

  const prevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const nextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const goToday = () => {
    const t = new Date()
    setViewYear(t.getFullYear())
    setViewMonth(t.getMonth())
    setSelectedDay(startOfLocalDay(t))
  }

  if (!userId) {
    return <p className="p-6 text-foreground">Invalid user.</p>
  }

  if (userErr) {
    return (
      <main className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <p className="bg-gradient-to-br from-indigo-400 via-violet-400 to-violet-500 bg-clip-text text-7xl font-bold tracking-tight text-transparent sm:text-8xl">
            404
          </p>
          <h1 className="mt-4 text-xl font-semibold text-foreground sm:text-2xl">Page not found</h1>
          <p className="mt-3 text-pretty text-muted-foreground sm:text-base">
            This page doesn’t exist or isn’t available to your account. Check the link or return to
            home.
          </p>
          <Button asChild variant="gradient" size="lg" className="mt-8 min-w-[200px]">
            <Link href="/myhome">Back to home</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="relative isolate min-h-[calc(100vh-8rem)] w-full overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-background to-muted/35" />
        <div className="absolute -top-40 left-1/2 h-[22rem] w-[min(100%,48rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.18),transparent_70%)] blur-2xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-24 -left-16 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/[0.12]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full border-border/80 bg-card/70 px-3.5 shadow-sm backdrop-blur-sm transition-colors hover:bg-card"
          >
            <Link href="/myhome">
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              {isMgmtRole(sessionRole) ? 'Back to team' : 'Back to home'}
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-lg shadow-primary/[0.04] ring-1 ring-border/40">
          <div className="border-b border-border px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="min-w-[140px] text-center font-medium text-foreground">
                  {new Date(viewYear, viewMonth, 1).toLocaleString('default', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="ml-2 text-sm font-medium text-primary hover:underline"
                >
                  Today
                </button>
              </div>
            </div>
            <div
              className="mt-3 grid w-full max-w-full gap-1 pb-1 sm:gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${calendarDays.length}, minmax(0, 1fr))`,
              }}
            >
              {calendarDays.map((d) => {
                const dow = d.getDay()
                const isWeekend = dow === 0 || dow === 6
                const selected = isSameLocalDay(d, selectedDay)
                const label = d.toLocaleDateString('en', { weekday: 'short' })
                const dayKey = localDayKey(d)
                const loggedSec = calendarDayLoggedSeconds[dayKey] ?? 0
                const dayFillRatio = Math.min(1, loggedSec / expectedSecondsPerDay)
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setSelectedDay(startOfLocalDay(d))}
                    className={cn(
                      'flex min-w-0 w-full flex-col overflow-hidden rounded-none border p-0 leading-none transition-colors',
                      selected
                        ? 'border-primary bg-primary/12 text-primary ring-1 ring-inset ring-primary/35'
                        : cn(
                            'border-transparent bg-muted/60 hover:bg-muted',
                            isWeekend ? 'text-destructive/80' : 'text-muted-foreground'
                          )
                    )}
                  >
                    <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 sm:px-1.5 sm:py-2">
                      <span className="max-w-full truncate text-[6px] font-normal uppercase tracking-wide opacity-80 sm:text-[7px]">
                        {label}
                      </span>
                      <span className="tabular-nums text-[10px] font-semibold sm:text-[11px]">
                        {d.getDate()}
                      </span>
                    </div>
                    <div
                      className="relative h-2 w-full min-h-[6px] shrink-0 overflow-hidden bg-muted/40 sm:h-2.5"
                      aria-hidden
                    >
                      <div
                        className={cn(
                          'h-full max-w-full rounded-none transition-[width] duration-300 ease-out',
                          DAY_LOGGED_FILL_CLASS
                        )}
                        style={{
                          width: loggedSec > 0 ? `max(3px, ${dayFillRatio * 100}%)` : 0,
                        }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 border-b border-border p-4 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {selectedDay.toLocaleDateString('en', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <p className="min-w-0 text-4xl font-bold tabular-nums text-foreground">
                  {formatDurationSeconds(clippedSessionDaySeconds + offlineDaySeconds)}
                </p>
                {dayActivityScorePct != null ? (
                  <span className="shrink-0 pt-1.5 text-right text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
                    Activity
                    <br />
                    <span className="tabular-nums text-foreground/90">{dayActivityScorePct}%</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="min-w-0">
              <div
                className="flex gap-0 border-b border-border"
                role="tablist"
                aria-label="Tasks and app usage for this day"
              >
                <button
                  id="rollup-tab-tasks"
                  type="button"
                  role="tab"
                  aria-selected={dailyRollupTab === 'tasks'}
                  aria-controls="rollup-panel-tasks"
                  className={cn(
                    '-mb-px border-b-2 px-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-2',
                    dailyRollupTab === 'tasks'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setDailyRollupTab('tasks')}
                >
                  Tasks
                </button>
                <button
                  id="rollup-tab-apps"
                  type="button"
                  role="tab"
                  aria-selected={dailyRollupTab === 'apps'}
                  aria-controls="rollup-panel-apps"
                  className={cn(
                    '-mb-px border-b-2 px-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-2',
                    dailyRollupTab === 'apps'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setDailyRollupTab('apps')}
                >
                  Apps & URLs
                </button>
              </div>
              {dailyRollupTab === 'tasks' ? (
                <div
                  id="rollup-panel-tasks"
                  role="tabpanel"
                  aria-labelledby="rollup-tab-tasks"
                  className="min-w-0 pt-3"
                >
                  <div
                    className={cn(
                      'space-y-2 text-sm',
                      rollupExpandedTasks &&
                        'max-h-64 min-h-0 overflow-y-auto overscroll-contain pr-0.5'
                    )}
                  >
                    {taskRollup.length ? (
                      visibleTasks.map(([key, row]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                        >
                          <span className="truncate text-foreground/90">{row.name}</span>
                          <span className="shrink-0 tabular-nums font-medium text-foreground">
                            {formatDurationSeconds(Math.round(row.seconds))}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">
                        {pendingOfflineDaySeconds > 0
                          ? 'No approved tracked or offline time for this day — pending request is below.'
                          : 'No tasks for this day.'}
                      </p>
                    )}
                  </div>
                  {tasksRollupHasMore ? (
                    <button
                      type="button"
                      onClick={() => setRollupExpandedTasks((e) => !e)}
                      className="mt-2 text-sm font-medium text-primary hover:underline"
                    >
                      {rollupExpandedTasks
                        ? 'Show less'
                        : `Show more (${taskRollup.length - ROLLUP_PREVIEW_LIMIT})`}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  id="rollup-panel-apps"
                  role="tabpanel"
                  aria-labelledby="rollup-tab-apps"
                  className="min-w-0 pt-3"
                >
                  <div
                    className={cn(
                      'space-y-2 text-sm',
                      rollupExpandedApps &&
                        'max-h-64 min-h-0 overflow-y-auto overscroll-contain pr-0.5'
                    )}
                  >
                    {appRollup.length ? (
                      visibleApps.map(([label, sec]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                        >
                          <span className="truncate text-foreground/90" title={label}>
                            {label}
                          </span>
                          <span className="shrink-0 tabular-nums font-medium text-foreground">
                            {formatDurationSeconds(Math.round(sec))}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No app activity for this day.</p>
                    )}
                  </div>
                  {appsRollupHasMore ? (
                    <button
                      type="button"
                      onClick={() => setRollupExpandedApps((e) => !e)}
                      className="mt-2 text-sm font-medium text-primary hover:underline"
                    >
                      {rollupExpandedApps
                        ? 'Show less'
                        : `Show more (${appRollup.length - ROLLUP_PREVIEW_LIMIT})`}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6">
            <div className="mb-6 w-full min-w-0">
              <div
                className="mb-1 grid min-w-0 text-[7px] leading-none text-muted-foreground/85 sm:text-[8px]"
                style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
              >
                {HOURS_24.map((h) => (
                  <span
                    key={h}
                    className="block truncate text-center tabular-nums"
                    title={hourSlotTitle(h)}
                  >
                    {hourSlotLabel(h)}
                  </span>
                ))}
              </div>
              <div className="relative h-10 overflow-hidden rounded-md border border-border bg-muted/50 sm:h-11">
                <div
                  className="pointer-events-none absolute inset-0 grid min-w-0"
                  style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                  aria-hidden
                >
                  {HOURS_24.map((h) => (
                    <div
                      key={h}
                      className={cn(
                        'border-r border-border/25 last:border-r-0',
                        h % 6 === 0 && 'border-border/45'
                      )}
                    />
                  ))}
                </div>
                <div className="absolute inset-x-1 bottom-1 top-1 z-[1]">
                  <div className="relative h-full min-h-8 w-full overflow-hidden rounded-sm bg-muted-foreground/15">
                    {approvedOfflineDayLaneGradient ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
                        style={{ backgroundImage: approvedOfflineDayLaneGradient }}
                      />
                    ) : null}
                    {blocks.map((b, i) => {
                      const g = displayGroups[i]
                      const barTitle = g
                        ? `${mergedGroupTaskLabel(g) ?? 'Tracked time'} — ${formatDurationSeconds(Math.max(0, Math.round((g.clipEnd - g.clipStart) / 1000)))}`
                        : 'Tracked time'
                      return (
                        <div
                          key={b.key}
                          className="absolute bottom-0 top-0 z-[2] bg-emerald-500/90"
                          style={{ left: `${b.left}%`, width: `${Math.max(b.width, 0.25)}%` }}
                          title={barTitle}
                        />
                      )
                    })}
                    {pendingOfflineBarBlocks.map((b) => (
                      <div
                        key={`off-pend-${b.key}`}
                        className="absolute bottom-0 top-0 z-[3] border border-dashed border-amber-600/70 bg-amber-400/45 dark:border-amber-400/60 dark:bg-amber-500/35"
                        style={{ left: `${b.left}%`, width: `${Math.max(b.width, 0.25)}%` }}
                        title="Offline time — pending approval (not counted in total)"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {loadErr ? <p className="text-sm text-destructive">{loadErr}</p> : null}
            {loading ? <p className="text-muted-foreground">Loading…</p> : null}

            {!loading &&
              timelineRows.map((row) => {
                if (row.kind === 'offline') {
                  const { entry, clipStart, clipEnd } = row
                  const start = new Date(clipStart)
                  const end = new Date(clipEnd)
                  const rangeLabel = `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`
                  const sec = Math.max(0, Math.round((clipEnd - clipStart) / 1000))
                  const showDel = canDeleteOfflineEntry(entry)
                  const st = offlineStatusKey(entry.status)
                  const isPending = st === 'PENDING'
                  const isApproved = st === 'APPROVED'
                  const borderClass = isPending
                    ? 'border-l-amber-500 border-dashed'
                    : 'border-l-orange-500 border-solid'
                  const labelClass = isPending
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-orange-700 dark:text-orange-400'
                  return (
                    <div
                      key={`off-${entry.id}`}
                      className={cn(
                        'mb-8 border-l-4 border-t border-border pt-6 pl-4 first:border-t-0 first:pt-0',
                        borderClass
                      )}
                    >
                      <div className="mb-3 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={cn(
                                'text-[11px] font-semibold uppercase tracking-wide',
                                labelClass
                              )}
                            >
                              {isPending
                                ? 'Offline / manual time'
                                : isApproved
                                  ? 'Offline / manual time (approved)'
                                  : `Offline / manual time (${st})`}
                              {isPending ? (
                                <span className="ml-2 font-normal normal-case text-muted-foreground">
                                  · Pending approval
                                </span>
                              ) : null}
                            </p>
                            <h3 className="mt-0.5 text-sm font-semibold text-foreground">
                              {entry.description}
                            </h3>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {showDel ? (
                              <button
                                type="button"
                                className="text-xs text-destructive hover:underline"
                                onClick={() => setOfflineDeleteId(entry.id)}
                              >
                                Delete
                              </button>
                            ) : null}
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {formatDurationSeconds(sec)}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">{rangeLabel}</p>
                      </div>
                    </div>
                  )
                }

                const g = row.group
                const start = new Date(g.clipStart)
                const end = new Date(g.clipEnd)
                const rangeLabel = `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`
                const sessionIdSet = new Set(g.members.map((m) => m.id))
                const shots = screenshots
                  .filter((sh) => sh.session_id != null && sessionIdSet.has(sh.session_id))
                  .sort((a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime())
                const taskLabel = mergedGroupTaskLabel(g)
                const groupSecondsTracked = Math.max(
                  0,
                  Math.round((g.clipEnd - g.clipStart) / 1000)
                )

                return (
                  <div
                    key={g.key}
                    className="mb-8 border-t border-border pt-6 first:border-t-0 first:pt-0"
                  >
                    <div className="mb-3 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {taskLabel ?? 'Tracked time'}
                        </h3>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {formatDurationSeconds(groupSecondsTracked)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">{rangeLabel}</p>
                    </div>
                    {shots.length > 0 ? (
                      <ScreenshotGallery
                        screenshots={shots}
                        cacheScope={screenshotCacheScope || undefined}
                        showBlur
                        canManage={canManageScreenshots}
                        onBlur={canManageScreenshots ? handleScreenshotBlur : undefined}
                        onDelete={canManageScreenshots ? handleScreenshotDelete : undefined}
                      />
                    ) : null}
                  </div>
                )
              })}

            {!loading && timelineRows.length === 0 ? (
              <p className="text-muted-foreground">No tracked or offline time for this day.</p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setHistoryInfoOpen(true)}
                className="border-b border-dotted border-muted-foreground/50 text-sm text-muted-foreground hover:text-foreground"
              >
                History of changes
              </button>
              {showOfflineTimeFooterLink ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setOfflineSubmitErr(null)
                    setOfflineModalOpen(true)
                  }}
                >
                  {offlineModalUsesRequestFlow && !viewingOtherUserForOffline
                    ? 'Request offline time'
                    : 'Add offline time'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {portalReady && offlineModalOpen
        ? createPortal(
            <div
              role="presentation"
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
              onClick={() => setOfflineModalOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="offline-modal-title"
                className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="offline-modal-title" className="text-lg font-semibold text-foreground">
                  {offlineModalTitle}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{offlineModalExplainer}</p>
                <p className="mt-2 text-xs text-muted-foreground/90">
                  {user?.name ?? 'User'} ·{' '}
                  {selectedDay.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                {offlineSubmitBlocked ? (
                  <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                    Your account can&apos;t add offline time here. Ask an organization admin to lift
                    this restriction or to record the time for you.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Start (local)</span>
                    <input
                      type="time"
                      value={offlineFormStart}
                      disabled={offlineSubmitBlocked}
                      onChange={(e) => setOfflineFormStart(e.target.value)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">End (local)</span>
                    <input
                      type="time"
                      value={offlineFormEnd}
                      disabled={offlineSubmitBlocked}
                      onChange={(e) => setOfflineFormEnd(e.target.value)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Description</span>
                    <textarea
                      value={offlineFormDescription}
                      disabled={offlineSubmitBlocked}
                      onChange={(e) => setOfflineFormDescription(e.target.value)}
                      rows={3}
                      className="rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="e.g. Client meeting (no laptop)"
                    />
                  </label>
                </div>
                {offlineSubmitErr ? (
                  <p className="mt-3 text-sm text-destructive">{offlineSubmitErr}</p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    onClick={() => setOfflineModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={offlineSubmitting || offlineSubmitBlocked}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    onClick={() => void submitOfflineTime()}
                  >
                    {offlineSubmitting
                      ? offlineModalUsesRequestFlow
                        ? 'Submitting…'
                        : 'Saving…'
                      : offlineModalUsesRequestFlow
                        ? 'Submit request'
                        : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {portalReady && historyInfoOpen
        ? createPortal(
            <div
              role="presentation"
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
              onClick={() => setHistoryInfoOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-info-title"
                className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="history-info-title" className="text-lg font-semibold text-foreground">
                  History of changes
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Updates to time, activity, and workspace rules are applied by your organization.
                  If something looks wrong, contact an organization admin.
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() => setHistoryInfoOpen(false)}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <ConfirmDialog
        open={offlineDeleteId != null}
        onOpenChange={(open) => {
          if (!open) setOfflineDeleteId(null)
        }}
        title="Remove offline time?"
        description="Remove this offline time entry? This cannot be undone."
        variant="danger"
        confirmLabel="Remove"
        onConfirm={async () => {
          if (offlineDeleteId) await executeDeleteOffline(offlineDeleteId)
        }}
      />
    </main>
  )
}
