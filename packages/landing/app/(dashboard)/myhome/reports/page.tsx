'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Brush,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { ArrowDown, ArrowUp, ChevronDown, Download, FileText, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDurationSeconds } from '@/lib/format'
import { isManagerOrAbove, isOrgAdminRole } from '@/lib/roles'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/* ───────────────── Types ───────────────── */

type Granularity = 'daily' | 'weekly' | 'monthly'
type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom'

type BreakdownItem = { label: string; seconds: number; sessions: number }

type SessionRow = {
  id: string
  started_at: string
  ended_at: string | null
  duration_sec: number
  notes: string | null
  approval_status?: string | null
  is_manual?: boolean
  user?: { id: string; name: string; email: string } | null
  project?: { id: string; name: string; color?: string | null } | null
  task?: { id: string; name: string } | null
}

type TeamUser = { id: string; name: string; email: string; role: string }

/* ───────────────── Helpers ───────────────── */

const BRAND_PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
]

function mondayOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function computeDateRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { from: string; to: string } {
  const now = new Date()
  switch (preset) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { from: start.toISOString(), to: now.toISOString() }
    }
    case 'this_week': {
      const mon = mondayOfWeek(now)
      mon.setHours(0, 0, 0, 0)
      const sun = new Date(mon)
      sun.setDate(sun.getDate() + 6)
      sun.setHours(23, 59, 59, 999)
      return { from: mon.toISOString(), to: sun.toISOString() }
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { from: start.toISOString(), to: end.toISOString() }
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { from: start.toISOString(), to: end.toISOString() }
    }
    case 'custom': {
      const s = customStart
        ? new Date(customStart + 'T00:00:00')
        : new Date(now.getFullYear(), now.getMonth(), 1)
      const e = customEnd ? new Date(customEnd + 'T23:59:59.999') : now
      return { from: s.toISOString(), to: e.toISOString() }
    }
  }
}

function groupByToApi(g: Granularity): string {
  return g === 'weekly' ? 'week' : g === 'monthly' ? 'day' : 'day'
}

function formatXLabel(label: string, granularity: Granularity): string {
  if (granularity === 'weekly') {
    const m = label.match(/W(\d+)/)
    return m ? `Week ${parseInt(m[1])}` : label
  }
  if (granularity === 'monthly') {
    const d = new Date(label + 'T00:00:00')
    return d.toLocaleDateString('en', { month: 'short' })
  }
  const d = new Date(label + 'T00:00:00')
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
}

type SortKey = 'started_at' | 'duration_sec' | 'project'
type SortDir = 'asc' | 'desc'

/* ───────────────── Page ───────────────── */

export default function ReportsPage() {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const selfId = (session?.user as { id?: string } | undefined)?.id ?? ''
  const isManager = isManagerOrAbove(role)
  const isAdmin = isOrgAdminRole(role)

  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])

  const [totalSeconds, setTotalSeconds] = useState(0)
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([])
  const [projectBreakdown, setProjectBreakdown] = useState<BreakdownItem[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)

  const [tablePage, setTablePage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('started_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const PAGE_SIZE = 25

  useEffect(() => {
    if (!isManager && !isAdmin) return
    api
      .get<{ users: TeamUser[] }>('/v1/dashboard/team-summary')
      .then(({ data }) => setTeamUsers(data.users ?? []))
      .catch(() => {})
  }, [isManager, isAdmin])

  const dateRange = useMemo(
    () => computeDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const userId = selectedUserId || selfId
      const params: Record<string, string> = {
        from: dateRange.from,
        to: dateRange.to,
        group_by: groupByToApi(granularity),
        limit: '200',
      }
      if (userId) params.user_id = userId

      const [timeRes, projRes] = await Promise.all([
        api.get<{ total_seconds: number; breakdown: BreakdownItem[]; sessions: SessionRow[] }>(
          '/v1/reports/time',
          { params }
        ),
        api.get<{ total_seconds: number; breakdown: BreakdownItem[] }>('/v1/reports/time', {
          params: { ...params, group_by: 'project' },
        }),
      ])
      setTotalSeconds(timeRes.data.total_seconds ?? 0)
      setBreakdown(timeRes.data.breakdown ?? [])
      setSessions(timeRes.data.sessions ?? [])
      setProjectBreakdown(projRes.data.breakdown ?? [])
      setTablePage(1)
    } catch {
      setTotalSeconds(0)
      setBreakdown([])
      setSessions([])
      setProjectBreakdown([])
    } finally {
      setLoading(false)
    }
  }, [dateRange, granularity, selectedUserId, selfId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  /* ── Derived ─── */

  const dailyAvg = useMemo(() => {
    if (breakdown.length === 0) return 0
    return Math.round(totalSeconds / breakdown.length)
  }, [totalSeconds, breakdown])

  const topProject = useMemo(() => {
    if (projectBreakdown.length === 0) return 'None'
    return projectBreakdown[0].label
  }, [projectBreakdown])

  /* Chart data: each breakdown item is a data point with hours */
  const trendData = useMemo(
    () =>
      breakdown.map((b) => ({
        label: formatXLabel(b.label, granularity),
        rawLabel: b.label,
        hours: Math.round((b.seconds / 3600) * 10) / 10,
        seconds: b.seconds,
      })),
    [breakdown, granularity]
  )

  /* Donut data: top 8 + Other */
  const donutData = useMemo(() => {
    const top8 = projectBreakdown.slice(0, 8)
    const rest = projectBreakdown.slice(8).reduce((s, b) => s + b.seconds, 0)
    const items = top8.map((b) => ({
      name: b.label,
      value: Math.round(b.seconds / 60),
      seconds: b.seconds,
    }))
    if (rest > 0) items.push({ name: 'Other', value: Math.round(rest / 60), seconds: rest })
    return items
  }, [projectBreakdown])

  /* App usage (from activity logs) */
  const [appUsage, setAppUsage] = useState<{ name: string; seconds: number }[]>([])
  useEffect(() => {
    const userId = selectedUserId || selfId
    if (!userId) return
    api
      .get<{
        activity_logs: { active_app: string | null; window_start: string; window_end: string }[]
      }>('/v1/reports/activity', {
        params: { user_id: userId, from: dateRange.from, to: dateRange.to, limit: '500' },
      })
      .then(({ data }) => {
        const map = new Map<string, number>()
        for (const log of data.activity_logs ?? []) {
          const app = log.active_app || 'Unknown'
          const sec = Math.max(
            0,
            (new Date(log.window_end).getTime() - new Date(log.window_start).getTime()) / 1000
          )
          map.set(app, (map.get(app) ?? 0) + sec)
        }
        setAppUsage(
          [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, seconds]) => ({ name, seconds }))
        )
      })
      .catch(() => setAppUsage([]))
  }, [dateRange, selectedUserId, selfId])

  /* Sessions table: sort + paginate */
  const sortedSessions = useMemo(() => {
    const copy = [...sessions]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'started_at') {
        cmp = new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      } else if (sortKey === 'duration_sec') {
        cmp = a.duration_sec - b.duration_sec
      } else if (sortKey === 'project') {
        cmp = (a.project?.name ?? '').localeCompare(b.project?.name ?? '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [sessions, sortKey, sortDir])

  const pagedSessions = useMemo(
    () => sortedSessions.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE),
    [sortedSessions, tablePage]
  )

  const totalPages = Math.max(1, Math.ceil(sortedSessions.length / PAGE_SIZE))

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronDown className="ml-0.5 inline h-3 w-3 opacity-30" />
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-0.5 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-0.5 inline h-3 w-3" />
    )
  }

  /* ── Exports ─── */

  async function handleCsvExport() {
    setExporting(true)
    try {
      const userId = selectedUserId || selfId
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
        format: 'csv',
      })
      if (userId) params.set('user_id', userId)
      const res = await api.get('/v1/reports/export', {
        params: Object.fromEntries(params),
        responseType: 'blob',
      })
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* noop */
    } finally {
      setExporting(false)
    }
  }

  async function handlePdfExport() {
    setPdfExporting(true)
    try {
      const userId = selectedUserId || selfId
      const { data } = await api.post<{ jobId: string }>('/v1/reports/export/pdf', {
        from: dateRange.from,
        to: dateRange.to,
        user_id: userId,
      })
      const jobId = data.jobId
      let attempts = 0
      const poll = async () => {
        attempts++
        if (attempts > 30) {
          setPdfExporting(false)
          return
        }
        const { data: status } = await api.get<{ status: string; url?: string }>(
          `/v1/reports/export/pdf/${jobId}`
        )
        if (status.status === 'completed' && status.url) {
          window.open(status.url, '_blank')
          setPdfExporting(false)
        } else if (status.status === 'failed') {
          setPdfExporting(false)
        } else {
          setTimeout(poll, 2000)
        }
      }
      setTimeout(poll, 2000)
    } catch {
      setPdfExporting(false)
    }
  }

  /* ── Presets ─── */
  const presets: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'this_week', label: 'This week' },
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'custom', label: 'Custom' },
  ]

  const granularities: { key: Granularity; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
  ]

  /* ── Render ─── */

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">Reports</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Detailed time tracking reports with export options.
      </p>

      {/* ── Controls bar ─────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        {/* User selector (MANAGER+) */}
        {(isManager || isAdmin) && teamUsers.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            User
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Myself</option>
              {teamUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Date presets */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date range
          <div className="flex gap-1">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  preset === p.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </label>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Start
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              End
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        {/* Granularity */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Granularity
          <div className="flex gap-1">
            {granularities.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGranularity(g.key)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  granularity === g.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </label>

        {/* Export buttons */}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => void handleCsvExport()}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            CSV
          </button>
          <button
            type="button"
            onClick={() => void handlePdfExport()}
            disabled={pdfExporting}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
          >
            {pdfExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            PDF
          </button>
        </div>
      </div>

      {/* ── Summary row ──────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 border-l-2 border-l-blue-500 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total hours</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatDurationSeconds(totalSeconds)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border/60 border-l-2 border-l-violet-500 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Daily average</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatDurationSeconds(dailyAvg)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border/60 border-l-2 border-l-emerald-500 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Top project</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-32" />
          ) : (
            <p className="mt-1 text-xl font-bold truncate">{topProject}</p>
          )}
        </div>
      </div>

      {/* ── Charts: TimeTrendChart + ProjectDonut ────────────────── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        {/* TimeTrendChart — 3 cols */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm lg:col-span-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Time trend
          </p>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : trendData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No time tracked in this range
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 20, left: -20 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND_PALETTE[0]} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={BRAND_PALETTE[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
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
                        payload?: Array<{ payload: { rawLabel: string; seconds: number } }>
                      }
                      if (!active || !payload?.[0]) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">{d.rawLabel}</p>
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
                    stroke={BRAND_PALETTE[0]}
                    strokeWidth={2}
                    fill="url(#trendGrad)"
                    animationDuration={800}
                  />
                  {trendData.length > 7 && (
                    <Brush dataKey="label" height={20} stroke="hsl(var(--border))" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ProjectDonut — 2 cols */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm lg:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Projects
          </p>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : donutData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No project data
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="45%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                    label={false}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={BRAND_PALETTE[i % BRAND_PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={(props: Record<string, unknown>) => {
                      const { active, payload } = props as {
                        active?: boolean
                        payload?: Array<{ payload: { name: string; seconds: number } }>
                      }
                      if (!active || !payload?.[0]) return null
                      const d = payload[0].payload
                      const pct =
                        totalSeconds > 0 ? Math.round((d.seconds / totalSeconds) * 100) : 0
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">{d.name}</p>
                          <p className="text-muted-foreground">
                            {formatDurationSeconds(d.seconds)} ({pct}%)
                          </p>
                        </div>
                      )
                    }}
                  />
                  <text
                    x="45%"
                    y="47%"
                    textAnchor="middle"
                    className="fill-foreground text-lg font-bold"
                  >
                    {formatDurationSeconds(totalSeconds)}
                  </text>
                  <text
                    x="45%"
                    y="57%"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    Total
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Legend */}
          {donutData.length > 0 && (
            <div className="mt-2 space-y-1">
              {donutData.map((d, i) => {
                const pct = totalSeconds > 0 ? Math.round((d.seconds / totalSeconds) * 100) : 0
                return (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: BRAND_PALETTE[i % BRAND_PALETTE.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{d.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {formatDurationSeconds(d.seconds)}
                    </span>
                    <span className="shrink-0 w-8 text-right font-mono tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── AppUsageChart (horizontal bars) ──────────────────────── */}
      <div className="mb-6 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          App usage
        </p>
        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : appUsage.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No app activity data for this range
          </div>
        ) : (
          <div style={{ height: Math.max(200, appUsage.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={appUsage.map((a) => ({
                  name: a.name.length > 20 ? a.name.slice(0, 20) + '…' : a.name,
                  fullName: a.name,
                  hours: Math.round((a.seconds / 3600) * 10) / 10,
                  seconds: a.seconds,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 10 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={140}
                />
                <RechartsTooltip
                  content={(props: Record<string, unknown>) => {
                    const { active, payload } = props as {
                      active?: boolean
                      payload?: Array<{ payload: { fullName: string; seconds: number } }>
                    }
                    if (!active || !payload?.[0]) return null
                    const d = payload[0].payload
                    const totalApp = appUsage.reduce((s, a) => s + a.seconds, 0)
                    const pct = totalApp > 0 ? Math.round((d.seconds / totalApp) * 100) : 0
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
                        <p className="font-medium text-foreground">{d.fullName}</p>
                        <p className="text-muted-foreground">
                          {formatDurationSeconds(d.seconds)} ({pct}%)
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="hours" fill={BRAND_PALETTE[0]} radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Time Sessions Table ──────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions ({sortedSessions.length})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('started_at')}
                    className="flex items-center hover:text-foreground"
                  >
                    Date <SortIcon col="started_at" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('duration_sec')}
                    className="flex items-center hover:text-foreground"
                  >
                    Duration <SortIcon col="duration_sec" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('project')}
                    className="flex items-center hover:text-foreground"
                  >
                    Project <SortIcon col="project" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Start / End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                  </tr>
                ))
              ) : pagedSessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No sessions in this range.
                  </td>
                </tr>
              ) : (
                pagedSessions.map((s) => {
                  const d = new Date(s.started_at)
                  const dateStr = d.toLocaleDateString('en', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                  const startTime = d.toLocaleTimeString('en', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })
                  const endTime = s.ended_at
                    ? new Date(s.ended_at).toLocaleTimeString('en', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'Running'
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-foreground">{dateStr}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-foreground">
                        {formatDurationSeconds(s.duration_sec)}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        {s.project?.name ?? 'No project'}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                        {startTime} – {endTime}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              Page {tablePage} of {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={tablePage >= totalPages}
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
