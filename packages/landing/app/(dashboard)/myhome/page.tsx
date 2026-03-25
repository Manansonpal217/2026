'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Settings } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDurationSeconds, formatRelativeFromIso, formatUtcOffsetLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AuthScreenshotThumb } from '@/components/AuthScreenshotThumb'

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

const POLL_MS = 15_000
const RELATIVE_TIME_TICK_MS = 10_000

function rowHasNoTrackedTime(u: TeamUserRow): boolean {
  return (
    (u.today_seconds ?? 0) <= 0 &&
    (u.yesterday_seconds ?? 0) <= 0 &&
    (u.this_week_seconds ?? 0) <= 0 &&
    (u.this_month_seconds ?? 0) <= 0
  )
}

export default function MyHomePage() {
  const [rows, setRows] = useState<TeamUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [, bumpRelativeUi] = useState(0)

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

  useEffect(() => {
    void fetchSummary(true)
  }, [fetchSummary])

  useEffect(() => {
    const id = window.setInterval(() => void fetchSummary(false), POLL_MS)
    return () => window.clearInterval(id)
  }, [fetchSummary])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchSummary(false)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [fetchSummary])

  useEffect(() => {
    const id = window.setInterval(() => bumpRelativeUi((n) => n + 1), RELATIVE_TIME_TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const ta = a.last_active ? new Date(a.last_active).getTime() : 0
      const tb = b.last_active ? new Date(b.last_active).getTime() : 0
      const cmp = ta - tb
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortDir])

  const tzLabel = formatUtcOffsetLabel()

  const showNoTrackedTimeHint =
    !loading && !err && sorted.length > 0 && sorted.every(rowHasNoTrackedTime)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-3 sm:px-5">
          <h1 className="text-lg font-semibold text-foreground">Manager Dashboard</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{tzLabel}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {err ? (
          <p className="p-6 text-sm text-destructive">{err}</p>
        ) : loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {showNoTrackedTimeHint ? (
              <div
                className="border-b border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground sm:px-5"
                role="status"
              >
                No tracked time in the database for these calendar windows yet (per employee
                timezone). Week and month totals use the same windows. After the desktop app syncs,
                numbers populate here. If you already track time, confirm the API URL and Postgres{' '}
                <code className="text-xs">TimeSession</code> rows for your org.
              </div>
            ) : null}
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    >
                      Last active
                      {sortDir === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Today</th>
                  <th className="px-4 py-3 font-medium">Yesterday</th>
                  <th className="px-4 py-3 font-medium">This week</th>
                  <th className="px-4 py-3 font-medium">This month</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => (
                  <tr key={u.id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/myhome/${u.id}`}
                        className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                      >
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            u.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/35'
                          )}
                          title={u.is_online ? 'Online' : 'Offline'}
                        />
                        {u.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/myhome/${u.id}`} className="block w-[140px]">
                        <div className="overflow-hidden rounded border border-border bg-muted/50">
                          <div className="border-b border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                            {formatRelativeFromIso(u.last_active)}
                          </div>
                          <div className="relative flex aspect-video items-center justify-center bg-muted">
                            {u.latest_screenshot?.id ? (
                              u.latest_screenshot.thumb_signed_url ||
                              u.latest_screenshot.signed_url ? (
                                <img
                                  src={
                                    u.latest_screenshot.thumb_signed_url ??
                                    u.latest_screenshot.signed_url!
                                  }
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <AuthScreenshotThumb
                                  screenshotId={u.latest_screenshot.id}
                                  className="h-full w-full object-cover"
                                  fallback={
                                    <span className="px-1 text-center text-[10px] leading-tight text-muted-foreground/70">
                                      No preview
                                    </span>
                                  }
                                />
                              )
                            ) : (
                              <span
                                className="px-1 text-center text-[10px] leading-tight text-muted-foreground/70"
                                title={
                                  u.last_active
                                    ? 'No screenshot in the database yet. The API needs working S3 (or R2) credentials so the desktop app can upload captures; see packages/backend/.env.example.'
                                    : undefined
                                }
                              >
                                {u.last_active ? 'No screenshot' : '···'}
                              </span>
                            )}
                          </div>
                        </div>
                        {u.last_active ? (
                          <span className="sr-only">
                            {new Date(u.last_active).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              hour12: true,
                            })}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground/90">
                      {formatDurationSeconds(u.today_seconds)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground/90">
                      {formatDurationSeconds(u.yesterday_seconds)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground/90">
                      {formatDurationSeconds(u.this_week_seconds)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground/90">
                      {formatDurationSeconds(u.this_month_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">No team members to show.</p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  )
}
