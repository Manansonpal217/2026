'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Brush,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Download, FileText, Loader2 } from 'lucide-react'
import { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { formatDurationSeconds } from '@/lib/format'
import { isManagerOrAbove, isOrgAdminRole } from '@/lib/roles'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/* ───────────────── Types ───────────────── */

type Granularity = 'daily' | 'weekly' | 'monthly'
type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom'

type BreakdownItem = { label: string; seconds: number; sessions: number }

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
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

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
        api.get<{ total_seconds: number; breakdown: BreakdownItem[] }>('/v1/reports/time', {
          params,
        }),
        api.get<{ total_seconds: number; breakdown: BreakdownItem[] }>('/v1/reports/time', {
          params: { ...params, group_by: 'project' },
        }),
      ])
      setTotalSeconds(timeRes.data.total_seconds ?? 0)
      setBreakdown(timeRes.data.breakdown ?? [])
      setProjectBreakdown(projRes.data.breakdown ?? [])
    } catch {
      setTotalSeconds(0)
      setBreakdown([])
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

  /* ── Exports ─── */

  async function handleCsvExport() {
    setExporting(true)
    setExportError(null)
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
      a.rel = 'noopener'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      const message =
        e instanceof AxiosError
          ? ((e.response?.data as { message?: string } | undefined)?.message ??
            'CSV export failed. Please try again.')
          : 'CSV export failed. Please try again.'
      setExportError(message)
    } finally {
      setExporting(false)
    }
  }

  async function handlePdfExport() {
    setPdfExporting(true)
    setExportError(null)
    try {
      const userId = selectedUserId || selfId
      const body: Record<string, string> = {
        from: dateRange.from,
        to: dateRange.to,
      }
      if (userId) body.user_id = userId

      const { data } = await api.post<{ jobId: string }>('/v1/reports/export/pdf', body)
      const jobId = data.jobId
      const maxAttempts = 30
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        try {
          const { data: status } = await api.get<{
            status: string
            url?: string | null
            error?: string
          }>(`/v1/reports/export/pdf/${jobId}`)
          if (status.status === 'completed' && status.url) {
            const a = document.createElement('a')
            a.href = status.url
            a.download = `report-${new Date().toISOString().slice(0, 10)}.pdf`
            a.rel = 'noopener noreferrer'
            a.target = '_blank'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            return
          }
          if (status.status === 'failed') {
            setExportError(status.error ?? 'PDF export failed. Please try again.')
            return
          }
        } catch {
          // Keep polling on transient errors; surface only if we fully time out.
        }
      }
      setExportError('PDF export is taking longer than expected. Please try again.')
    } catch (e: unknown) {
      const message =
        e instanceof AxiosError
          ? ((e.response?.data as { message?: string } | undefined)?.message ??
            'PDF export failed. Please try again.')
          : 'PDF export failed. Please try again.'
      setExportError(message)
    } finally {
      setPdfExporting(false)
    }
  }

  const canExport = isManager || isAdmin

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
    <main className="relative isolate mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
        <div className="absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full bg-blue-500/[0.09] blur-3xl dark:bg-blue-500/[0.12]" />
        <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/[0.12]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.35] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_100%)] dark:opacity-[0.2]" />
      </div>
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
        {canExport && (
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
        )}
      </div>
      {exportError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {exportError}
        </p>
      ) : null}

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
    </main>
  )
}
