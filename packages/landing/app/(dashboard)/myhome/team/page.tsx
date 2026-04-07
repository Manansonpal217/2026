'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock, Flame, MoreHorizontal, Settings, Users } from 'lucide-react'
import * as Progress from '@radix-ui/react-progress'
import { api } from '@/lib/api'
import { formatDurationSeconds } from '@/lib/format'
import { isOrgAdminRole, normalizeOrgRole } from '@/lib/roles'
import { InitialsAvatar } from '@/components/ui/initials-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { orderTeamUsersWithSelfFirst } from '@/lib/teamUserOrder'
import { cn } from '@/lib/utils'

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
  streak_days?: number
  at_risk?: boolean
  latest_screenshot: {
    id: string
    taken_at: string
    signed_url: string | null
    thumb_signed_url: string | null
    activity_score: number
  } | null
}

type FilterTab = 'all' | 'online' | 'offline' | 'at-risk'

const POLL_MS = 15_000

function ringColor(row: TeamUserRow): string {
  if (row.is_online) return 'ring-emerald-500'
  if (row.last_active) {
    const diff = Date.now() - new Date(row.last_active).getTime()
    if (diff < 10 * 60 * 1000) return 'ring-amber-400'
  }
  return 'ring-gray-400 dark:ring-gray-600'
}

function statusLabel(row: TeamUserRow): { text: string; cls: string } {
  if (row.is_online)
    return { text: 'Online', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
  if (row.last_active) {
    const diff = Date.now() - new Date(row.last_active).getTime()
    if (diff < 10 * 60 * 1000)
      return { text: 'Idle', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
  }
  return { text: 'Offline', cls: 'bg-muted text-muted-foreground' }
}

function secsToHours(s: number): string {
  return (s / 3600).toFixed(1)
}

function UserCardDropdown({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-50 w-48 rounded-lg border border-border bg-card py-1 shadow-lg">
            <Link
              href={`/myhome/${userId}`}
              className="block px-3 py-1.5 text-sm text-foreground hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              View Details
            </Link>
            <Link
              href={`/myhome/${userId}`}
              className="block px-3 py-1.5 text-sm text-foreground hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              View Full Report
            </Link>
            {isAdmin && (
              <Link
                href="/myhome/organization/settings"
                className="block px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                Adjust Settings
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TeamPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function TeamPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const rawRole = session?.user?.role as string | undefined
  const sessionRole = normalizeOrgRole(rawRole)
  const selfId = (session?.user as { id?: string } | undefined)?.id
  const isAdmin = isOrgAdminRole(sessionRole)

  const [rows, setRows] = useState<TeamUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [pendingOffline, setPendingOffline] = useState(0)

  useEffect(() => {
    if (sessionStatus === 'authenticated' && sessionRole !== 'manager') {
      router.replace('/myhome/dashboard')
    }
  }, [sessionStatus, sessionRole, router])

  const fetchTeam = useCallback(async (initial: boolean) => {
    try {
      if (initial) setLoading(true)
      const { data } = await api.get<{ users: TeamUserRow[] }>('/v1/dashboard/team-summary')
      setRows(data.users ?? [])
    } catch {
      if (initial) setRows([])
    } finally {
      if (initial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTeam(true)
    api
      .get('/v1/app/offline-time/pending')
      .then((r) => setPendingOffline(r.data.count ?? 0))
      .catch(() => {})
  }, [fetchTeam])

  useEffect(() => {
    const id = setInterval(() => void fetchTeam(false), POLL_MS)
    return () => clearInterval(id)
  }, [fetchTeam])

  const orderedRows = useMemo(() => orderTeamUsersWithSelfFirst(rows, selfId), [rows, selfId])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'online':
        return orderedRows.filter((r) => r.is_online)
      case 'offline':
        return orderedRows.filter((r) => !r.is_online)
      case 'at-risk':
        return orderedRows.filter((r) => r.at_risk === true)
      default:
        return orderedRows
    }
  }, [orderedRows, filter])

  const totalToday = useMemo(() => rows.reduce((s, r) => s + (r.today_seconds ?? 0), 0), [rows])
  const avgWeek = useMemo(() => {
    if (rows.length === 0) return 0
    return rows.reduce((s, r) => s + (r.this_week_seconds ?? 0), 0) / rows.length
  }, [rows])

  if (sessionStatus === 'loading' || loading) {
    return (
      <main className="relative isolate mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
        </div>
        <TeamPageSkeleton />
      </main>
    )
  }

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'online', label: 'Online', count: rows.filter((r) => r.is_online).length },
    { key: 'offline', label: 'Offline', count: rows.filter((r) => !r.is_online).length },
    { key: 'at-risk', label: 'At Risk', count: rows.filter((r) => r.at_risk).length },
  ]

  return (
    <main className="relative isolate mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
        <div className="absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full bg-emerald-500/[0.09] blur-3xl dark:bg-emerald-500/[0.12]" />
        <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/[0.12]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.35] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_100%)] dark:opacity-[0.2]" />
      </div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Your Team · {rows.length} members
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor team activity, identify at-risk members, and take quick actions.
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Total today</p>
          <p className="font-mono text-lg font-bold tabular-nums">
            {formatDurationSeconds(totalToday)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Avg this week</p>
          <p className="font-mono text-lg font-bold tabular-nums">
            {formatDurationSeconds(Math.round(avgWeek))}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Pending offline</p>
          <p className="font-mono text-lg font-bold tabular-nums">{pendingOffline}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {filterTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              filter === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 font-mono text-xs tabular-nums">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* User cards grid */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {filter === 'at-risk'
            ? 'No at-risk team members right now.'
            : 'No team members match this filter.'}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((row, i) => {
            const st = statusLabel(row)
            const score = row.latest_screenshot?.activity_score ?? 0

            return (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className={cn(
                  'rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
                  row.at_risk && 'border-l-4 border-l-amber-500'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar with ring */}
                  <div
                    className={cn(
                      'rounded-full ring-2 ring-offset-2 ring-offset-background',
                      ringColor(row)
                    )}
                  >
                    <InitialsAvatar name={row.name} size="md" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize bg-muted text-muted-foreground">
                        {row.role}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          st.cls
                        )}
                      >
                        {st.text}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email}</p>

                    {/* Metrics row */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="font-mono tabular-nums">
                        <span className="text-muted-foreground">Today </span>
                        <span className="font-semibold text-foreground">
                          {secsToHours(row.today_seconds)}h
                        </span>
                      </span>
                      <span className="font-mono tabular-nums">
                        <span className="text-muted-foreground">Week </span>
                        <span className="font-semibold text-foreground">
                          {secsToHours(row.this_week_seconds)}h
                          {row.at_risk && (
                            <AlertTriangle className="ml-0.5 inline h-3 w-3 text-amber-500" />
                          )}
                        </span>
                      </span>
                      {(row.streak_days ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 font-mono tabular-nums">
                          <Flame className="h-3 w-3 text-orange-500" />
                          <span className="font-semibold text-foreground">{row.streak_days}d</span>
                        </span>
                      )}
                    </div>

                    {/* Activity bar */}
                    <Progress.Root
                      value={Math.min(score, 100)}
                      max={100}
                      className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <Progress.Indicator
                        className="h-full rounded-full bg-brand-primary transition-all duration-300"
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </Progress.Root>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-start gap-1">
                    <UserCardDropdown userId={row.id} isAdmin={isAdmin} />
                  </div>
                </div>

                {/* Footer actions */}
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
                  <Link
                    href={`/myhome/${row.id}`}
                    className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    View Details
                  </Link>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </main>
  )
}
