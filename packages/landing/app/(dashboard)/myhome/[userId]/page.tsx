'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { isAxiosError } from 'axios'
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Flame,
  Home,
  Settings,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { api } from '@/lib/api'
import {
  endOfLocalDay,
  formatDurationSeconds,
  formatNotesForDisplay,
  formatUtcOffsetLabel,
  startOfLocalDay,
} from '@/lib/format'
import { ScreenshotGallery, type ScreenshotItem } from '@/components/ScreenshotGallery'
import { InitialsAvatar } from '@/components/ui/initials-avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buildScreenshotCacheScope, pruneScreenshotCache } from '@/lib/screenshotThumbCache'
import { cn } from '@/lib/utils'

type UserDetailTab = 'overview' | 'time' | 'screenshots' | 'activity'

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

const RECENT_STOP_MS = 10 * 60 * 1000
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

function offlineBlocksForDay(
  entries: OfflineTimeRow[],
  day: Date
): { left: number; width: number; key: string }[] {
  const dayStart = startOfLocalDay(day).getTime()
  const dayEnd = endOfLocalDay(day).getTime()
  const dayMs = dayEnd - dayStart + 1
  const out: { left: number; width: number; key: string }[] = []
  for (const o of entries) {
    const r = offlineClippedRangeOnDay(o, day)
    if (!r || r.clipEnd - r.clipStart < MIN_CLIPPED_SEGMENT_MS) continue
    out.push({
      key: o.id,
      left: ((r.clipStart - dayStart) / dayMs) * 100,
      width: ((r.clipEnd - r.clipStart) / dayMs) * 100,
    })
  }
  return out
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
  const [allowEmployeeOfflineTime, setAllowEmployeeOfflineTime] = useState(false)
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

  const [activeTab, setActiveTab] = useState<UserDetailTab>('overview')
  const [weeklyChartData, setWeeklyChartData] = useState<
    { day: string; hours: number; seconds: number }[]
  >([])
  const [weeklyChartLoading, setWeeklyChartLoading] = useState(true)
  const [userStreak, setUserStreak] = useState(0)

  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [historyInfoOpen, setHistoryInfoOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [offlineSubmitErr, setOfflineSubmitErr] = useState<string | null>(null)
  const [offlineSubmitting, setOfflineSubmitting] = useState(false)
  const [offlineFormStart, setOfflineFormStart] = useState('09:00')
  const [offlineFormEnd, setOfflineFormEnd] = useState('17:00')
  const [offlineFormDescription, setOfflineFormDescription] = useState('')

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

    try {
      const blockUi = blockUiUntilDayHydratedRef.current
      if (blockUi) setLoading(true)
      setLoadErr(null)
      const [sessRes, ssRes, actRes, offRes] = await Promise.all([
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
      const rawSessions = sessRes.data.sessions ?? []
      setSessions(rawSessions.map(normalizeSessionRow).filter((x): x is SessionRow => x != null))
      setScreenshots(ssRes.data.screenshots ?? [])
      setOfflineTimes(offRes.data.offline_time ?? [])
      setActivityLogs(actRes.data.activity_logs ?? [])
      blockUiUntilDayHydratedRef.current = false
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
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
        setAllowEmployeeOfflineTime(data.allow_employee_offline_time ?? false)
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
          setAllowEmployeeOfflineTime(data.allow_employee_offline_time ?? false)
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

  const offlineBarBlocks = useMemo(
    () => offlineBlocksForDay(offlineTimes, selectedDay),
    [offlineTimes, selectedDay]
  )

  const offlineDaySeconds = useMemo(() => {
    let t = 0
    for (const o of offlineTimes) {
      const r = offlineClippedRangeOnDay(o, selectedDay)
      if (r) t += (r.clipEnd - r.clipStart) / 1000
    }
    return Math.round(t)
  }, [offlineTimes, selectedDay])

  const dayOfflineFromMonth = useMemo(() => {
    const days = daysInMonth(viewYear, viewMonth)
    return computeDayOfflineSecondsRecord(offlineEntriesMonth, days)
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

  const timelineRows = useMemo((): TimelineRow[] => {
    const rows: TimelineRow[] = []
    for (const g of displayGroups) rows.push({ kind: 'session', group: g })
    for (const o of offlineTimes) {
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

  const canAddOfflineTime = useMemo(() => {
    if (isMgmtRole(sessionRole) && user) return true
    if (sessionUserId !== userId) return false
    const o = user?.can_add_offline_time
    if (o === true) return true
    if (o === false) return false
    return allowEmployeeOfflineTime === true
  }, [
    sessionRole,
    sessionUserId,
    userId,
    user,
    user?.can_add_offline_time,
    allowEmployeeOfflineTime,
  ])

  const canDeleteOfflineEntry = useCallback(
    (_entry: OfflineTimeRow) => {
      if (isMgmtRole(sessionRole) && user) return true
      if (sessionUserId !== userId) return false
      const o = user?.can_add_offline_time
      if (o === true) return true
      if (o === false) return false
      return allowEmployeeOfflineTime === true
    },
    [sessionRole, sessionUserId, userId, user, user?.can_add_offline_time, allowEmployeeOfflineTime]
  )

  const taskRollup = useMemo(() => {
    const map = new Map<string, { name: string; seconds: number }>()
    for (const s of sessionsChrono) {
      const dur =
        s.ended_at != null
          ? Math.max(0, Number(s.duration_sec) || 0)
          : Math.max(0, (Date.now() - new Date(s.started_at).getTime()) / 1000)
      const key = sessionRollupKey(s)
      const name = sessionWorkLabel(s)
      const row = map.get(key) ?? { name, seconds: 0 }
      row.seconds += dur
      map.set(key, row)
    }
    return [...map.entries()].sort((a, b) => b[1].seconds - a[1].seconds)
  }, [sessionsChrono])

  const appRollup = useMemo(() => {
    const map = new Map<string, number>()
    for (const log of activityLogs) {
      const label = activityLabelFromLog(log)
      const sec = Math.max(
        0,
        (new Date(log.window_end).getTime() - new Date(log.window_start).getTime()) / 1000
      )
      map.set(label, (map.get(label) ?? 0) + sec)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [activityLogs])

  const dayActivityScorePct = useMemo(() => {
    const ds = startOfLocalDay(selectedDay).getTime()
    const de = endOfLocalDay(selectedDay).getTime()
    const raw = weightedActivityScoreForRange(activityLogs, ds, de)
    return raw != null ? Math.round(raw) : null
  }, [activityLogs, selectedDay])

  const presenceDot = useMemo(() => {
    if (!user) return 'idle' as const
    if (user.is_tracking) return 'green' as const
    if (user.last_active) {
      const ms = Date.now() - new Date(user.last_active).getTime()
      if (ms >= 0 && ms <= RECENT_STOP_MS) return 'yellow' as const
    }
    return 'idle' as const
  }, [user])

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

  const handleDeleteOffline = useCallback(
    async (id: string) => {
      if (typeof window !== 'undefined' && !window.confirm('Remove this offline time entry?')) {
        return
      }
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

  useEffect(() => {
    if (!userId || !user) return
    setWeeklyChartLoading(true)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    api
      .get<{ days: { date: string; total_seconds: number }[] }>('/v1/reports/time', {
        params: {
          user_id: userId,
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
          granularity: 'day',
        },
      })
      .then(({ data }) => {
        setWeeklyChartData(
          (data.days ?? []).map((d) => {
            const dow = new Date(d.date + 'T00:00:00').getDay()
            return {
              day: DAY_ABBR[dow === 0 ? 6 : dow - 1] ?? d.date.slice(5),
              hours: Math.round((d.total_seconds / 3600) * 10) / 10,
              seconds: d.total_seconds,
            }
          })
        )
      })
      .catch(() => setWeeklyChartData([]))
      .finally(() => setWeeklyChartLoading(false))
  }, [userId, user])

  const tzLabel = formatUtcOffsetLabel()

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

  const presenceStatusText =
    presenceDot === 'green' ? 'Online' : presenceDot === 'yellow' ? 'Idle' : 'Offline'
  const presenceStatusCls =
    presenceDot === 'green'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : presenceDot === 'yellow'
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        : 'bg-muted text-muted-foreground'

  const tabItems: { key: UserDetailTab; label: string; icon: typeof Home }[] = [
    { key: 'overview', label: 'Overview', icon: Home },
    { key: 'time', label: 'Time', icon: Calendar },
    { key: 'screenshots', label: 'Screenshots', icon: Camera },
    { key: 'activity', label: 'Activity', icon: BarChart3 },
  ]

  const PIE_COLORS = [
    '#2563eb',
    '#7c3aed',
    '#059669',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
  ]

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Link
          href="/myhome"
          className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={cn(
              'rounded-full ring-2 ring-offset-2 ring-offset-background',
              presenceDot === 'green'
                ? 'ring-emerald-500'
                : presenceDot === 'yellow'
                  ? 'ring-amber-400'
                  : 'ring-gray-400'
            )}
          >
            <InitialsAvatar name={user?.name ?? '?'} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {user?.name ?? '…'}
              </h1>
              <span
                className={cn('rounded-full px-2 py-0.5 text-xs font-medium', presenceStatusCls)}
              >
                {presenceStatusText}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                {user?.role ?? ''}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{user?.email ?? ''}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tzLabel}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canAddOfflineTime && (
              <button
                type="button"
                onClick={() => {
                  setOfflineSubmitErr(null)
                  setOfflineModalOpen(true)
                  setActiveTab('time')
                }}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted/60"
              >
                <Clock className="mr-1.5 inline h-3.5 w-3.5" />
                Add Offline Time
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex border-b border-border">
        {tabItems.map((t) => {
          const active = activeTab === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Overview Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 2x2 stat grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 border-l-2 border-l-blue-500 bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Today</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatDurationSeconds(clippedSessionDaySeconds + offlineDaySeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 border-l-2 border-l-blue-500 bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">This week</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatDurationSeconds(
                  Object.values(calendarDayLoggedSeconds).reduce((a, b) => a + b, 0)
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 border-l-2 border-l-violet-500 bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">This month</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatDurationSeconds(
                  Object.values(calendarDayLoggedSeconds).reduce((a, b) => a + b, 0)
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 border-l-2 border-l-emerald-500 bg-card p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Flame className="h-4 w-4 text-orange-500" />
                Streak
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{userStreak} days</p>
            </div>
          </div>

          {/* Weekly chart */}
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              This week
            </p>
            {weeklyChartLoading ? (
              <Skeleton className="h-44 w-full rounded-lg" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={weeklyChartData}
                    margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                  >
                    <defs>
                      <linearGradient id="userAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--brand-primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--brand-primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      content={(props: Record<string, unknown>) => {
                        const { active, payload } = props as {
                          active?: boolean
                          payload?: Array<{ payload: { day: string; seconds: number } }>
                        }
                        if (!active || !payload?.[0]) return null
                        const d = payload[0].payload
                        return (
                          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
                            <p className="font-medium text-foreground">{d.day}</p>
                            <p className="text-muted-foreground">
                              {formatDurationSeconds(d.seconds)}
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="hours"
                      stroke="hsl(var(--brand-primary))"
                      strokeWidth={2}
                      fill="url(#userAreaGrad)"
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Last 3 offline time entries */}
          {offlineTimes.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent offline time
              </p>
              <div className="space-y-2">
                {offlineTimes.slice(0, 3).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {o.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.start_time).toLocaleDateString()} · {o.status}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                      {formatDurationSeconds(
                        Math.round(
                          (new Date(o.end_time).getTime() - new Date(o.start_time).getTime()) / 1000
                        )
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Time Tab (existing content) ────────────────────────────────────── */}
      {activeTab === 'time' && (
        <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
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
                      <p className="text-muted-foreground">No tasks for this day.</p>
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
                  <div className="relative h-full overflow-hidden rounded-sm bg-muted-foreground/15">
                    {blocks.map((b, i) => {
                      const g = displayGroups[i]
                      const barTitle = g
                        ? `${mergedGroupTaskLabel(g) ?? 'Tracked time'} — ${formatDurationSeconds(Math.max(0, Math.round((g.clipEnd - g.clipStart) / 1000)))}`
                        : 'Tracked time'
                      return (
                        <div
                          key={b.key}
                          className="absolute bottom-0 top-0 z-[1] bg-emerald-500/90"
                          style={{ left: `${b.left}%`, width: `${Math.max(b.width, 0.25)}%` }}
                          title={barTitle}
                        />
                      )
                    })}
                    {offlineBarBlocks.map((b) => (
                      <div
                        key={`off-${b.key}`}
                        className="absolute bottom-0 top-0 z-[2] bg-amber-500/90"
                        style={{ left: `${b.left}%`, width: `${Math.max(b.width, 0.25)}%` }}
                        title="Offline / manual time"
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
                  return (
                    <div
                      key={`off-${entry.id}`}
                      className="mb-8 border-l-4 border-l-amber-500/90 border-t border-border pt-6 pl-4 first:border-t-0 first:pt-0"
                    >
                      <div className="mb-3 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              Offline / manual time
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
                                onClick={() => void handleDeleteOffline(entry.id)}
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

            <div className="mt-8 flex flex-wrap gap-6 border-t border-border pt-6 text-sm">
              {canAddOfflineTime ? (
                <button
                  type="button"
                  onClick={() => {
                    setOfflineSubmitErr(null)
                    setOfflineModalOpen(true)
                  }}
                  className="border-b border-dotted border-muted-foreground/50 text-muted-foreground hover:text-foreground"
                >
                  + Add offline time
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setHistoryInfoOpen(true)}
                className="border-b border-dotted border-muted-foreground/50 text-muted-foreground hover:text-foreground"
              >
                History of changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Screenshots Tab ────────────────────────────────────────────────── */}
      {activeTab === 'screenshots' && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {selectedDay.toLocaleDateString('en', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <input
              type="date"
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              value={`${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T00:00:00')
                if (!isNaN(d.getTime())) setSelectedDay(startOfLocalDay(d))
              }}
            />
          </div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          ) : (
            <div
              style={{ columnCount: 3, columnGap: '0.75rem' }}
              className="[column-count:1] sm:[column-count:2] lg:[column-count:3]"
            >
              {screenshots.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No screenshots for this day.
                </p>
              ) : (
                <ScreenshotGallery
                  screenshots={screenshots}
                  cacheScope={screenshotCacheScope || undefined}
                  showBlur
                  canManage={canManageScreenshots}
                  onBlur={canManageScreenshots ? handleScreenshotBlur : undefined}
                  onDelete={canManageScreenshots ? handleScreenshotDelete : undefined}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Activity Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          {/* Date picker */}
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-foreground">
              {selectedDay.toLocaleDateString('en', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <input
              type="date"
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              value={`${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T00:00:00')
                if (!isNaN(d.getTime())) setSelectedDay(startOfLocalDay(d))
              }}
            />
          </div>

          {/* Hourly bar chart */}
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hourly activity
            </p>
            {loading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={HOURS_24.map((h) => {
                      const hStart = startOfLocalDay(selectedDay).getTime() + h * 3600_000
                      const hEnd = hStart + 3600_000
                      let sec = 0
                      for (const log of activityLogs) {
                        const ws = new Date(log.window_start).getTime()
                        const we = new Date(log.window_end).getTime()
                        const a = Math.max(hStart, ws)
                        const b = Math.min(hEnd, we)
                        if (b > a) sec += (b - a) / 1000
                      }
                      return { hour: `${h}`, minutes: Math.round(sec / 60) }
                    })}
                    margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                  >
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      content={(props: Record<string, unknown>) => {
                        const { active, payload } = props as {
                          active?: boolean
                          payload?: Array<{ payload: { hour: string; minutes: number } }>
                        }
                        if (!active || !payload?.[0]) return null
                        const d = payload[0].payload
                        return (
                          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
                            <p className="font-medium text-foreground">{d.hour}:00</p>
                            <p className="text-muted-foreground">{d.minutes} min active</p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="minutes" fill="hsl(var(--brand-primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* App usage pie chart + ranked list */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                App usage
              </p>
              {appRollup.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No app activity for this day.
                </p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          const top8 = appRollup.slice(0, 8)
                          const rest = appRollup.slice(8).reduce((s, [, v]) => s + v, 0)
                          const items = top8.map(([name, sec]) => ({
                            name,
                            value: Math.round(sec / 60),
                          }))
                          if (rest > 0) items.push({ name: 'Other', value: Math.round(rest / 60) })
                          return items
                        })()}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {appRollup.slice(0, 9).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ranked apps
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {appRollup.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No data</p>
                ) : (
                  appRollup.map(([label, sec], i) => {
                    const totalSec = appRollup.reduce((s, [, v]) => s + v, 0)
                    const pct = totalSec > 0 ? Math.round((sec / totalSec) * 100) : 0
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-foreground"
                          title={label}
                        >
                          {label}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: PIE_COLORS[i % PIE_COLORS.length],
                              }}
                            />
                          </div>
                          <span className="w-8 text-right font-mono text-xs tabular-nums text-muted-foreground">
                            {pct}%
                          </span>
                          <span className="w-14 text-right font-mono text-xs tabular-nums text-foreground">
                            {formatDurationSeconds(Math.round(sec))}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                  Add offline time
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user?.name ?? 'User'} ·{' '}
                  {selectedDay.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Start (local)</span>
                    <input
                      type="time"
                      value={offlineFormStart}
                      onChange={(e) => setOfflineFormStart(e.target.value)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">End (local)</span>
                    <input
                      type="time"
                      value={offlineFormEnd}
                      onChange={(e) => setOfflineFormEnd(e.target.value)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Description</span>
                    <textarea
                      value={offlineFormDescription}
                      onChange={(e) => setOfflineFormDescription(e.target.value)}
                      rows={3}
                      className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
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
                    disabled={offlineSubmitting}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    onClick={() => void submitOfflineTime()}
                  >
                    {offlineSubmitting ? 'Saving…' : 'Save'}
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
    </main>
  )
}
