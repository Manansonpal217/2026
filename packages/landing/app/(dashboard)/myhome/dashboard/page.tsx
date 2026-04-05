'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Clock,
  Flame,
  LayoutDashboard,
  TrendingDown,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as Progress from '@radix-ui/react-progress'
import { api } from '@/lib/api'
import { formatDurationSeconds, formatUtcOffsetLabel } from '@/lib/format'
import { getDashboardSettingsShortcut, isManagerOrAbove, isOrgAdminRole } from '@/lib/roles'
import { Skeleton } from '@/components/ui/skeleton'
import { InitialsAvatar } from '@/components/ui/initials-avatar'
import { cn } from '@/lib/utils'

const CalendarHeatmap = dynamic(() => import('react-calendar-heatmap'), { ssr: false })

// ── Types ───────────────────────────────────────────────────────────────────────

type TeamUserRow = {
  id: string
  name: string
  email: string
  role: string
  status: string
  last_active: string | null
  is_online: boolean
  today_seconds: number
  yesterday_seconds: number
  this_week_seconds: number
  this_month_seconds: number
  latest_screenshot: {
    id: string
    taken_at: string
    signed_url: string | null
    thumb_signed_url: string | null
    activity_score: number
  } | null
}

type OrgAnalytics = {
  totals: {
    users: number
    new_users_last_7_days: number
    time_sessions_started_today_utc: number
  }
  users_by_status: Record<string, number>
}

type HeatmapDatum = { date: string; count: number }
type WeeklyDatum = { day: string; hours: number; seconds: number }

// ── Helpers ─────────────────────────────────────────────────────────────────────

function pctChange(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? 100 : null
  return Math.round(((today - yesterday) / yesterday) * 100)
}

function secsToHM(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

// ── StatCard ────────────────────────────────────────────────────────────────────

type StatAccent = 'blue' | 'violet' | 'emerald'

const ACCENT_BORDER: Record<StatAccent, string> = {
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
  emerald: 'border-l-emerald-500',
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {pct}%
    </span>
  )
}

function MiniSparkline({ data }: { data: number[] }) {
  const points = data.map((v, i) => ({ x: i, y: v }))
  return (
    <div className="h-8 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="y"
            stroke="hsl(var(--brand-primary))"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  loading,
  accent = 'blue',
  trendPct,
  sparkData,
}: {
  title: string
  value: string
  hint?: string
  icon: LucideIcon
  loading?: boolean
  accent?: StatAccent
  trendPct?: number | null
  sparkData?: number[]
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card shadow-sm border-l-2',
        ACCENT_BORDER[accent]
      )}
    >
      <div className="flex flex-row items-start justify-between space-y-0 px-4 pb-2 pt-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
      </div>
      <div className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                {value}
              </p>
              <div className="mt-1 flex items-center gap-2">
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                {trendPct !== undefined && <TrendBadge pct={trendPct ?? null} />}
              </div>
            </div>
            {sparkData && sparkData.length > 1 && <MiniSparkline data={sparkData} />}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ActivityHeatmap ─────────────────────────────────────────────────────────────

function heatmapColor(value: { date: string; count?: number } | undefined): string {
  if (!value || !value.count || value.count === 0) return 'fill-muted'
  if (value.count < 7200) return 'fill-blue-200 dark:fill-blue-900/60'
  if (value.count < 14400) return 'fill-blue-400 dark:fill-blue-700/80'
  return 'fill-blue-600 dark:fill-blue-500'
}

function ActivityHeatmap({ data, loading }: { data: HeatmapDatum[]; loading: boolean }) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 364)

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          52-week activity
        </p>
        <div className="overflow-x-auto rounded-lg [&_svg]:w-full [&_rect]:rx-[2px]">
          <CalendarHeatmap
            startDate={startDate}
            endDate={endDate}
            values={data}
            classForValue={(v) => heatmapColor(v as { date: string; count?: number } | undefined)}
            titleForValue={(v) => {
              const d = v as { date: string; count?: number } | undefined
              return d ? `${d.date}: ${secsToHM(d.count ?? 0)} tracked` : ''
            }}
            showWeekdayLabels
            gutterSize={2}
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-200 dark:bg-blue-900/60" />
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-400 dark:bg-blue-700/80" />
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-600 dark:bg-blue-500" />
          <span>More</span>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  )
}

// ── WeeklyAreaChart ─────────────────────────────────────────────────────────────

function CustomTooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: WeeklyDatum }>
}) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.day}</p>
      <p className="text-muted-foreground">{secsToHM(d.seconds)}</p>
    </div>
  )
}

function WeeklyAreaChart({ data, loading }: { data: WeeklyDatum[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    )
  }

  const maxH = Math.max(...data.map((d) => d.hours), 1) + 1

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        This week
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand-primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--brand-primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              domain={[0, maxH]}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <RechartsTooltip content={<CustomTooltipContent />} />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="hsl(var(--brand-primary))"
              strokeWidth={2}
              fill="url(#areaGrad)"
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── TeamStatusGrid ──────────────────────────────────────────────────────────────

function ringColor(row: TeamUserRow): string {
  if (row.is_online) return 'ring-emerald-500'
  if (row.last_active) {
    const diff = Date.now() - new Date(row.last_active).getTime()
    if (diff < 10 * 60 * 1000) return 'ring-amber-400'
  }
  return 'ring-gray-400 dark:ring-gray-600'
}

function statusLabel(row: TeamUserRow): string {
  if (row.is_online) return 'Online'
  if (row.last_active) {
    const diff = Date.now() - new Date(row.last_active).getTime()
    if (diff < 10 * 60 * 1000) return 'Idle'
  }
  return 'Offline'
}

function TeamStatusGrid({ rows, loading }: { rows: TeamUserRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No team members in view</p>
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Team status
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.slice(0, 12).map((r) => {
          const score = r.latest_screenshot?.activity_score ?? 0
          return (
            <div
              key={r.id}
              className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card p-3"
            >
              <div
                className={cn(
                  'rounded-full ring-2 ring-offset-1 ring-offset-background',
                  ringColor(r)
                )}
              >
                <InitialsAvatar name={r.name} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground capitalize">{r.role}</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">{statusLabel(r)}</span>
                </div>
                <p className="mt-1 font-mono text-xs tabular-nums text-foreground/80">
                  {formatDurationSeconds(r.today_seconds)}
                </p>
                <Progress.Root
                  value={Math.min(score, 100)}
                  max={100}
                  className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
                >
                  <Progress.Indicator
                    className="h-full rounded-full bg-brand-primary transition-all duration-300"
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </Progress.Root>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function DashboardPage() {
  const { data: session } = useSession()
  const [rows, setRows] = useState<TeamUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [orgAnalytics, setOrgAnalytics] = useState<OrgAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [heatmapData, setHeatmapData] = useState<HeatmapDatum[]>([])
  const [heatmapLoading, setHeatmapLoading] = useState(true)
  const [weeklyData, setWeeklyData] = useState<WeeklyDatum[]>([])
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const prevTodayRef = useRef(0)

  const sessionRole = session?.user?.role as string | undefined
  const isOrgAdmin = isOrgAdminRole(sessionRole)
  const isManager = isManagerOrAbove(sessionRole)
  const dashboardSettings = getDashboardSettingsShortcut(sessionRole)

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true)
      setErr(null)
      const { data } = await api.get<{ users: TeamUserRow[] }>('/v1/dashboard/team-summary')
      setRows(data.users ?? [])
    } catch (e: unknown) {
      if (isInitial) setErr(e instanceof Error ? e.message : 'Could not load dashboard')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  const fetchOrgAnalytics = useCallback(async () => {
    if (!isOrgAdmin) return
    setAnalyticsLoading(true)
    try {
      const { data } = await api.get<OrgAnalytics>('/v1/admin/analytics')
      setOrgAnalytics(data)
    } catch {
      setOrgAnalytics(null)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [isOrgAdmin])

  const fetchHeatmap = useCallback(async () => {
    setHeatmapLoading(true)
    try {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 364)
      const { data } = await api.get<{ days: HeatmapDatum[] }>('/v1/reports/activity', {
        params: {
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
          granularity: 'day',
        },
      })
      setHeatmapData((data.days ?? []).map((d) => ({ date: d.date, count: d.count ?? 0 })))
    } catch {
      setHeatmapData([])
    } finally {
      setHeatmapLoading(false)
    }
  }, [])

  const fetchWeekly = useCallback(async () => {
    setWeeklyLoading(true)
    try {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 6)
      const { data } = await api.get<{ days: { date: string; total_seconds: number }[] }>(
        '/v1/reports/time',
        {
          params: {
            start: start.toISOString().slice(0, 10),
            end: end.toISOString().slice(0, 10),
            granularity: 'day',
          },
        }
      )
      const mapped = (data.days ?? []).map((d, i) => ({
        day:
          DAY_ABBR[
            new Date(d.date + 'T00:00:00').getDay() === 0
              ? 6
              : new Date(d.date + 'T00:00:00').getDay() - 1
          ] ?? d.date.slice(5),
        hours: Math.round((d.total_seconds / 3600) * 10) / 10,
        seconds: d.total_seconds,
      }))
      setWeeklyData(mapped)
    } catch {
      setWeeklyData([])
    } finally {
      setWeeklyLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSummary(true)
    void fetchHeatmap()
    void fetchWeekly()
  }, [fetchSummary, fetchHeatmap, fetchWeekly])

  useEffect(() => {
    void fetchOrgAnalytics()
  }, [fetchOrgAnalytics])

  useEffect(() => {
    const id = window.setInterval(() => void fetchSummary(false), 15_000)
    return () => window.clearInterval(id)
  }, [fetchSummary])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchSummary(false)
        void fetchOrgAnalytics()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [fetchSummary, fetchOrgAnalytics])

  // ── Computed ──────────────────────────────────────────────────────────────────

  const { onlineCount, sumToday, sumYesterday, sumWeek, sumMonth } = useMemo(() => {
    let online = 0
    let t = 0
    let y = 0
    let w = 0
    let m = 0
    for (const r of rows) {
      if (r.is_online) online += 1
      t += r.today_seconds ?? 0
      y += r.yesterday_seconds ?? 0
      w += r.this_week_seconds ?? 0
      m += r.this_month_seconds ?? 0
    }
    return { onlineCount: online, sumToday: t, sumYesterday: y, sumWeek: w, sumMonth: m }
  }, [rows])

  useEffect(() => {
    prevTodayRef.current = sumYesterday
  }, [sumYesterday])

  const todayTrend = pctChange(sumToday, sumYesterday)
  const last7Days = weeklyData.map((d) => d.seconds)

  const tzLabel = formatUtcOffsetLabel()

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Live analytics and team overview.{' '}
              <Link href="/myhome" className="font-medium text-primary hover:underline">
                Home
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            {tzLabel}
          </span>
          {dashboardSettings ? (
            <Link
              href={dashboardSettings.href}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
            >
              {dashboardSettings.kind === 'users' ? (
                <UserCog className="h-4 w-4 text-muted-foreground" aria-hidden />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
              {dashboardSettings.label}
            </Link>
          ) : null}
        </div>
      </header>

      {err ? (
        <p className="mb-6 text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Stat cards — 2 cols each on desktop */}
        <div className="xl:col-span-3">
          <StatCard
            title="People in view"
            value={String(rows.length)}
            hint="Team members"
            icon={Users}
            loading={loading}
            accent="violet"
          />
        </div>
        <div className="xl:col-span-3">
          <StatCard
            title="Online now"
            value={String(onlineCount)}
            hint="Active heartbeat"
            icon={Zap}
            loading={loading}
            accent="emerald"
          />
        </div>
        <div className="xl:col-span-3">
          <StatCard
            title="Tracked today"
            value={formatDurationSeconds(sumToday)}
            hint="vs yesterday"
            icon={Clock}
            loading={loading}
            accent="blue"
            trendPct={todayTrend}
            sparkData={last7Days}
          />
        </div>
        <div className="xl:col-span-3">
          <StatCard
            title="This week"
            value={formatDurationSeconds(sumWeek)}
            icon={TrendingUp}
            loading={loading}
            accent="blue"
            sparkData={last7Days}
          />
        </div>

        {/* Activity heatmap — 8 cols spanning 2 rows on desktop, hidden on mobile */}
        <div className="hidden md:block xl:col-span-8 xl:row-span-2">
          <div className="h-full rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <ActivityHeatmap data={heatmapData} loading={heatmapLoading} />
          </div>
        </div>

        {/* Weekly chart — 4 cols on desktop */}
        <div className="xl:col-span-4">
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <WeeklyAreaChart data={weeklyData} loading={weeklyLoading} />
          </div>
        </div>

        {/* Team status grid — 4 cols on desktop, MANAGER+ only */}
        {isManager && (
          <div className="xl:col-span-4">
            <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <TeamStatusGrid rows={rows} loading={loading} />
            </div>
          </div>
        )}

        {/* Org analytics for ADMIN */}
        {isOrgAdmin && (
          <>
            <div className="xl:col-span-3">
              <StatCard
                title="Total org users"
                value={orgAnalytics ? String(orgAnalytics.totals.users) : '—'}
                hint="All members"
                icon={Users}
                loading={analyticsLoading}
                accent="violet"
              />
            </div>
            <div className="xl:col-span-3">
              <StatCard
                title="New users (7d)"
                value={orgAnalytics ? String(orgAnalytics.totals.new_users_last_7_days) : '—'}
                hint="This week"
                icon={UserPlus}
                loading={analyticsLoading}
                accent="violet"
              />
            </div>
            <div className="xl:col-span-3">
              <StatCard
                title="Sessions today"
                value={
                  orgAnalytics ? String(orgAnalytics.totals.time_sessions_started_today_utc) : '—'
                }
                hint="UTC day"
                icon={Clock}
                loading={analyticsLoading}
                accent="blue"
              />
            </div>
            <div className="xl:col-span-3">
              <StatCard
                title="This month"
                value={formatDurationSeconds(sumMonth)}
                hint="Combined totals"
                icon={TrendingUp}
                loading={loading}
                accent="blue"
              />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
