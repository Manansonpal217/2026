'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Flame,
  LayoutDashboard,
  Sparkles,
  Target,
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
import { orderTeamUsersWithSelfFirst } from '@/lib/teamUserOrder'
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
  blue: 'border-l-sky-500',
  violet: 'border-l-violet-500',
  emerald: 'border-l-emerald-500',
}

const ACCENT_ICON_WRAP: Record<StatAccent, string> = {
  blue: 'bg-gradient-to-br from-sky-500/15 to-sky-600/5 text-sky-600 dark:text-sky-400 ring-sky-500/20',
  violet:
    'bg-gradient-to-br from-violet-500/15 to-violet-600/5 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  emerald:
    'bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
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
        'group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/25 shadow-lg shadow-black/[0.04] ring-1 ring-black/[0.04] transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-xl hover:shadow-primary/5 dark:from-card dark:via-card dark:to-muted/15 dark:ring-white/[0.06] dark:hover:shadow-black/40',
        'border-l-[3px]',
        ACCENT_BORDER[accent]
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
        style={{
          background:
            accent === 'violet'
              ? 'linear-gradient(135deg, rgb(139 92 246 / 0.35), transparent)'
              : accent === 'emerald'
                ? 'linear-gradient(135deg, rgb(16 185 129 / 0.35), transparent)'
                : 'linear-gradient(135deg, rgb(14 165 233 / 0.35), transparent)',
        }}
        aria-hidden
      />
      <div className="relative flex flex-row items-start justify-between space-y-0 px-4 pb-1.5 pt-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">{title}</p>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
            ACCENT_ICON_WRAP[accent]
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </div>
      </div>
      <div className="relative px-4 pb-3">
        {loading ? (
          <Skeleton className="h-7 w-20 rounded-md" />
        ) : (
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {value}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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

function DashboardPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/15 p-5 shadow-lg shadow-black/[0.04] ring-1 ring-black/[0.04] transition-shadow duration-300 hover:shadow-xl dark:from-card dark:via-card dark:to-muted/10 dark:ring-white/[0.06]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        aria-hidden
      />
      {children}
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

  const totalTracked = data.reduce((sum, d) => sum + (d.count ?? 0), 0)
  const isEmpty = !loading && totalTracked === 0

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col space-y-2">
        <Skeleton className="h-3.5 w-28 rounded-md" />
        <Skeleton className="min-h-[132px] flex-1 rounded-xl sm:min-h-[152px]" />
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            52-week activity
          </p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/60">
          <Flame className="h-7 w-7 text-muted-foreground/50" aria-hidden />
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          No tracked time in the last year yet. Once your team logs work, this heatmap fills in by
          day.
        </p>
      </div>
    )
  }

  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-2 flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              52-week activity
            </p>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground sm:text-right">
            Columns = weeks · rows Sun→Sat
          </p>
        </div>
        {/*
          showWeekdayLabels reserves ~30px but only renders Mon/Wed/Fri — large gap.
          Moderate SVG height keeps month labels readable (scaling the whole SVG inflates text).
        */}
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border/50 bg-muted/20 px-0 py-1 shadow-inner [&_rect]:rx-[2px] [&_svg]:block [&_svg]:h-[132px] [&_svg]:w-auto [&_svg]:min-w-0 [&_svg]:max-w-none sm:[&_svg]:h-[152px] [&_text]:fill-muted-foreground [&_text]:[font-size:9px]">
            <CalendarHeatmap
              startDate={startDate}
              endDate={endDate}
              values={data}
              horizontal
              showMonthLabels
              showWeekdayLabels={false}
              gutterSize={1}
              classForValue={(v) => heatmapColor(v as { date: string; count?: number } | undefined)}
              titleForValue={(v) => {
                const d = v as { date: string; count?: number } | undefined
                return d ? `${d.date}: ${secsToHM(d.count ?? 0)} tracked` : ''
              }}
            />
          </div>
        </div>
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
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
    <div className="rounded-lg border border-border/80 bg-card/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-medium text-foreground">{d.day}</p>
      <p className="text-[11px] text-muted-foreground">{secsToHM(d.seconds)}</p>
    </div>
  )
}

function WeeklyAreaChart({ data, loading }: { data: WeeklyDatum[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col space-y-2">
        <Skeleton className="h-3.5 w-28 rounded-md" />
        <Skeleton className="min-h-[132px] flex-1 rounded-xl sm:min-h-[152px]" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-2 py-6 text-center">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            This week
          </p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/60">
          <Clock className="h-7 w-7 text-muted-foreground/50" aria-hidden />
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          No daily totals for the last 7 days. Open the desktop app and track time to see the chart
          here.
        </p>
      </div>
    )
  }

  const maxH = Math.max(1, ...data.map((d) => d.hours)) + 1

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          This week
        </p>
      </div>
      <div className="h-full min-h-[132px] w-full flex-1 basis-0 sm:min-h-[152px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand-primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--brand-primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis
              width={32}
              domain={[0, maxH]}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <RechartsTooltip content={<CustomTooltipContent />} />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="hsl(var(--brand-primary))"
              strokeWidth={1.75}
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
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
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
      <div className="mb-3 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Team status
        </p>
      </div>
      <div className="flex max-h-[28rem] flex-col gap-2.5 overflow-y-auto pr-1">
        {rows.map((r) => {
          const score = r.latest_screenshot?.activity_score ?? 0
          return (
            <div
              key={r.id}
              className="group flex min-h-0 items-start gap-3 rounded-xl border border-border/50 bg-gradient-to-r from-muted/20 to-transparent p-3 shadow-sm transition-all hover:border-primary/25 hover:bg-muted/35 hover:shadow-md"
            >
              <div
                className={cn(
                  'shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background',
                  ringColor(r)
                )}
              >
                <InitialsAvatar name={r.name} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-semibold leading-snug text-foreground">
                  {r.name}
                </p>
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
  const selfId = (session?.user as { id?: string } | undefined)?.id
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
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      const { data } = await api.get<{ breakdown: { label: string; seconds: number }[] }>(
        '/v1/reports/time',
        {
          params: {
            from: start.toISOString(),
            to: end.toISOString(),
            group_by: 'day',
          },
        }
      )
      setHeatmapData(
        (data.breakdown ?? []).map((d) => ({
          date: d.label,
          count: d.seconds,
        }))
      )
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
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      const { data } = await api.get<{ breakdown: { label: string; seconds: number }[] }>(
        '/v1/reports/time',
        {
          params: {
            from: start.toISOString(),
            to: end.toISOString(),
            group_by: 'day',
          },
        }
      )
      const byDate = new Map((data.breakdown ?? []).map((b) => [b.label, b.seconds]))
      const mapped: WeeklyDatum[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() - i)
        const key = d.toISOString().slice(0, 10)
        const seconds = byDate.get(key) ?? 0
        const dow = d.getUTCDay()
        const mondayIdx = dow === 0 ? 6 : dow - 1
        mapped.push({
          day: DAY_ABBR[mondayIdx] ?? key.slice(5),
          hours: Math.round((seconds / 3600) * 10) / 10,
          seconds,
        })
      }
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

  const teamRowsForGrid = useMemo(() => orderTeamUsersWithSelfFirst(rows, selfId), [rows, selfId])

  useEffect(() => {
    prevTodayRef.current = sumYesterday
  }, [sumYesterday])

  const todayTrend = pctChange(sumToday, sumYesterday)
  const last7Days = weeklyData.map((d) => d.seconds)

  const peakDayThisWeek = useMemo(() => {
    if (!weeklyData.length) return null
    let best = weeklyData[0]
    for (const d of weeklyData) {
      if (d.seconds > best.seconds) best = d
    }
    return best.seconds > 0 ? best : null
  }, [weeklyData])

  const tzLabel = formatUtcOffsetLabel()

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="relative isolate mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
        <div className="absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full bg-violet-500/[0.11] blur-3xl dark:bg-violet-500/[0.14]" />
        <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/[0.12]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.35] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_100%)] dark:opacity-[0.2]" />
      </div>
      {/* Header */}
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent shadow-inner ring-1 ring-primary/25">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_hsl(160_84%_39%_/_0.7)]" />
                Live
              </span>
              <span className="text-[11px] text-muted-foreground">Updates every 15s</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/75 bg-clip-text text-transparent">
                Dashboard
              </span>
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Live analytics and team overview.{' '}
              <Link
                href="/myhome"
                className="font-medium text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline"
              >
                Home
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
            <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            {tzLabel}
          </span>
          {dashboardSettings ? (
            <Link
              href={dashboardSettings.href}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-3 text-xs font-medium text-foreground shadow-md backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-muted/60 hover:shadow-lg"
            >
              {dashboardSettings.kind === 'users' ? (
                <UserCog className="h-3.5 w-3.5 text-primary/80" aria-hidden />
              ) : (
                <Building2 className="h-3.5 w-3.5 text-primary/80" aria-hidden />
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

      {/* Bento grid — chart row uses nested grid + stretch for equal-height panels */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-12">
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

        {/* Heatmap + weekly: mobile = weekly only; md+ = same row, equal height */}
        <div className="col-span-1 grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-12 md:items-stretch xl:col-span-12">
          <div className="hidden min-h-0 min-w-0 md:col-span-8 md:block">
            <DashboardPanel className="flex h-full min-h-[300px] flex-col p-4 sm:p-5">
              <ActivityHeatmap data={heatmapData} loading={heatmapLoading} />
            </DashboardPanel>
          </div>
          <div className="min-h-0 min-w-0 md:col-span-4">
            <DashboardPanel className="flex h-full min-h-[300px] flex-col p-4 sm:p-5">
              <WeeklyAreaChart data={weeklyData} loading={weeklyLoading} />
            </DashboardPanel>
          </div>
        </div>

        {/* Team status + snapshot cards — one full row (12 cols) */}
        {isManager ? (
          <>
            <div className="xl:col-span-8">
              <DashboardPanel className="flex min-h-[320px] flex-col p-4 sm:p-5">
                <TeamStatusGrid rows={teamRowsForGrid} loading={loading} />
              </DashboardPanel>
            </div>
            <div className="xl:col-span-4">
              <div className="grid h-full min-h-[320px] grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <StatCard
                  title="Yesterday"
                  value={loading ? '—' : formatDurationSeconds(sumYesterday)}
                  hint="Team total"
                  icon={Clock}
                  loading={loading}
                  accent="blue"
                />
                <StatCard
                  title="Peak day"
                  value={peakDayThisWeek?.day ?? '—'}
                  hint={
                    peakDayThisWeek ? formatDurationSeconds(peakDayThisWeek.seconds) : 'Last 7 days'
                  }
                  icon={Target}
                  loading={weeklyLoading}
                  accent="violet"
                />
                <StatCard
                  title="Month to date"
                  value={loading ? '—' : formatDurationSeconds(sumMonth)}
                  hint="Team combined"
                  icon={TrendingUp}
                  loading={loading}
                  accent="emerald"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="xl:col-span-12">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              <StatCard
                title="Yesterday"
                value={loading ? '—' : formatDurationSeconds(sumYesterday)}
                hint="Your org total"
                icon={Clock}
                loading={loading}
                accent="blue"
              />
              <StatCard
                title="Peak day"
                value={peakDayThisWeek?.day ?? '—'}
                hint={
                  peakDayThisWeek ? formatDurationSeconds(peakDayThisWeek.seconds) : 'Last 7 days'
                }
                icon={Target}
                loading={weeklyLoading}
                accent="violet"
              />
              <StatCard
                title="Month to date"
                value={loading ? '—' : formatDurationSeconds(sumMonth)}
                hint="Combined"
                icon={TrendingUp}
                loading={loading}
                accent="emerald"
              />
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
