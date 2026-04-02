'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Clock,
  LayoutDashboard,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { formatDurationSeconds, formatUtcOffsetLabel } from '@/lib/format'
import { getDashboardSettingsShortcut, isOrgAdminRole } from '@/lib/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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

const POLL_MS = 15_000

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  title: string
  value: string
  hint?: string
  icon: LucideIcon
  loading?: boolean
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
      </CardHeader>
      <CardContent className="pb-5">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        )}
        {hint && !loading ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [rows, setRows] = useState<TeamUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [orgAnalytics, setOrgAnalytics] = useState<OrgAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const sessionRole = session?.user?.role as string | undefined
  const isOrgAdmin = isOrgAdminRole(sessionRole)
  const dashboardSettings = getDashboardSettingsShortcut(sessionRole)

  const fetchSummary = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true)
      setErr(null)
      const { data } = await api.get<{ users: TeamUserRow[] }>('/v1/dashboard/team-summary')
      setRows(data.users ?? [])
    } catch (e: unknown) {
      if (isInitial) {
        setErr(e instanceof Error ? e.message : 'Could not load dashboard')
      }
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

  useEffect(() => {
    void fetchSummary(true)
  }, [fetchSummary])

  useEffect(() => {
    void fetchOrgAnalytics()
  }, [fetchOrgAnalytics])

  useEffect(() => {
    const id = window.setInterval(() => void fetchSummary(false), POLL_MS)
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

  const { onlineCount, sumToday, sumWeek, sumMonth } = useMemo(() => {
    let online = 0
    let t = 0
    let w = 0
    let m = 0
    for (const r of rows) {
      if (r.is_online) online += 1
      t += r.today_seconds ?? 0
      w += r.this_week_seconds ?? 0
      m += r.this_month_seconds ?? 0
    }
    return { onlineCount: online, sumToday: t, sumWeek: w, sumMonth: m }
  }, [rows])

  const tzLabel = formatUtcOffsetLabel()

  const statusEntries = orgAnalytics
    ? Object.entries(orgAnalytics.users_by_status).sort((a, b) => b[1] - a[1])
    : []

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Organization analytics and team-wide time totals. Time uses each person&apos;s
              timezone; org-wide metrics refresh with your data. Open{' '}
              <Link href="/myhome" className="font-medium text-primary hover:underline">
                Home
              </Link>{' '}
              for the live team activity table.
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

      <section aria-label="Analytics summary" className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Analytics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="People in view"
            value={String(rows.length)}
            hint="Users you can see on this dashboard"
            icon={Users}
            loading={loading}
          />
          <StatCard
            title="Online now"
            value={String(onlineCount)}
            hint="Active in the last few minutes"
            icon={Zap}
            loading={loading}
          />
          <StatCard
            title="Tracked time today"
            value={formatDurationSeconds(sumToday)}
            hint="Sum of today's totals (scoped team)"
            icon={Clock}
            loading={loading}
          />
          <StatCard
            title="This week"
            value={formatDurationSeconds(sumWeek)}
            hint="Combined this-week totals"
            icon={TrendingUp}
            loading={loading}
          />
        </div>

        {isOrgAdmin ? (
          <>
            <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Organization
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total org users"
                value={orgAnalytics ? String(orgAnalytics.totals.users) : '—'}
                hint="All members in your organization"
                icon={Users}
                loading={analyticsLoading}
              />
              <StatCard
                title="New users (7 days)"
                value={orgAnalytics ? String(orgAnalytics.totals.new_users_last_7_days) : '—'}
                hint="Accounts created this week"
                icon={UserPlus}
                loading={analyticsLoading}
              />
              <StatCard
                title="Sessions started today"
                value={
                  orgAnalytics ? String(orgAnalytics.totals.time_sessions_started_today_utc) : '—'
                }
                hint="UTC calendar day"
                icon={Clock}
                loading={analyticsLoading}
              />
              <StatCard
                title="This month (team)"
                value={formatDurationSeconds(sumMonth)}
                hint="Sum of this-month totals for your scoped team"
                icon={TrendingUp}
                loading={loading}
              />
            </div>
            {statusEntries.length > 0 ? (
              <Card className="mt-4 border-border/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Users by account status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-wrap gap-3">
                    {statusEntries.map(([status, count]) => (
                      <li
                        key={status}
                        className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <span className="font-medium capitalize text-foreground">{status}</span>
                        <span className="ml-2 tabular-nums text-muted-foreground">{count}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
