'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { formatDurationSeconds, formatRelativeFromIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AuthScreenshotThumb } from '@/components/AuthScreenshotThumb'
import { InitialsAvatar as Avatar } from '@/components/ui/initials-avatar'
import { Skeleton } from '@/components/ui/skeleton'

type TeamUserRow = {
  id: string
  name: string
  email: string
  role: string
  status: string
  org_id?: string
  org_name?: string | null
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

function TimeCell({ seconds }: { seconds: number }) {
  return (
    <div className="min-w-[5rem] tabular-nums text-foreground/90">
      {formatDurationSeconds(seconds)}
    </div>
  )
}

type OrgOption = { id: string; name: string }

export function TeamActivityPanel() {
  const { data: session } = useSession()
  const isPlatformAdmin = session?.user?.is_platform_admin === true

  const [rows, setRows] = useState<TeamUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [, bumpRelativeUi] = useState(0)
  const [orgFilter, setOrgFilter] = useState<string>('')
  const [orgs, setOrgs] = useState<OrgOption[]>([])

  useEffect(() => {
    if (!isPlatformAdmin) {
      setOrgs([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { data } = await api.get<{
          organizations: { id: string; name: string }[]
          total: number
        }>('/v1/platform/orgs', { params: { page: 1, limit: 100 } })
        if (cancelled) return
        setOrgs(
          (data.organizations ?? [])
            .map((o) => ({ id: o.id, name: o.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      } catch {
        if (!cancelled) setOrgs([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isPlatformAdmin])

  const fetchSummary = useCallback(
    async (isInitial: boolean) => {
      try {
        if (isInitial) setLoading(true)
        setErr(null)
        const params = isPlatformAdmin && orgFilter ? { org_id: orgFilter } : undefined
        const { data } = await api.get<{ users: TeamUserRow[] }>('/v1/dashboard/team-summary', {
          params,
        })
        setRows(data.users ?? [])
      } catch (e: unknown) {
        if (isInitial) {
          setErr(e instanceof Error ? e.message : 'Could not load team activity')
        }
      } finally {
        if (isInitial) setLoading(false)
      }
    },
    [isPlatformAdmin, orgFilter]
  )

  useEffect(() => {
    void fetchSummary(true)
  }, [fetchSummary])

  useEffect(() => {
    if (!isPlatformAdmin && orgFilter) {
      setOrgFilter('')
    }
  }, [isPlatformAdmin, orgFilter])

  useEffect(() => {
    const id = window.setInterval(() => void fetchSummary(false), POLL_MS)
    return () => window.clearInterval(id)
  }, [fetchSummary])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchSummary(false)
      }
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

  const showNoTrackedTimeHint =
    !loading && !err && sorted.length > 0 && sorted.every(rowHasNoTrackedTime)

  const showOrgColumn = isPlatformAdmin

  return (
    <section aria-label="Team activity">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">Team activity</h2>
        {isPlatformAdmin ? (
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm sm:max-w-xs">
            <span className="text-muted-foreground">Organization</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              aria-label="Filter team activity by organization"
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
        {err ? (
          <p className="p-6 text-sm text-destructive">{err}</p>
        ) : loading ? (
          <div className="p-6">
            <div className="mb-4 flex gap-4 border-b border-border pb-4">
              {isPlatformAdmin ? <Skeleton className="h-10 max-w-[200px]" /> : null}
              <Skeleton className="h-10 max-w-[180px] flex-1" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border py-3 last:border-0"
              >
                {isPlatformAdmin ? <Skeleton className="h-10 w-28 shrink-0" /> : null}
                <Skeleton className="h-10 w-48 shrink-0" />
                <Skeleton className="h-14 w-20 shrink-0" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 sm:p-12">
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <p className="text-base font-medium text-foreground">No team members yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                When users are added to your organization, they&apos;ll appear here with time totals
                and last activity. If you expect a list, confirm your manager scope and org
                membership in the admin team page.
              </p>
            </div>
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
            <table
              className={cn(
                'w-full border-collapse text-left text-sm',
                showOrgColumn ? 'min-w-[960px]' : 'min-w-[880px]'
              )}
            >
              <thead>
                <tr className="border-b border-border bg-muted/60 text-muted-foreground">
                  {showOrgColumn ? <th className="px-4 py-3 font-medium">Organization</th> : null}
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
                    {showOrgColumn ? (
                      <td className="max-w-[10rem] truncate px-4 py-3 text-muted-foreground">
                        {u.org_name ?? '—'}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <Link
                        href={`/myhome/${u.id}`}
                        className="group flex items-center gap-3 no-underline"
                      >
                        <Avatar name={u.name} size="md" />
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              u.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/35'
                            )}
                            title={u.is_online ? 'Online' : 'Offline'}
                          />
                          <span className="font-medium text-primary group-hover:underline">
                            {u.name}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/myhome/${u.id}`}
                        className="group relative flex w-[7.5rem] flex-col gap-1 no-underline"
                      >
                        <span
                          className="text-xs font-medium text-foreground group-hover:text-primary group-hover:underline"
                          suppressHydrationWarning
                        >
                          {formatRelativeFromIso(u.last_active)}
                        </span>
                        <div className="relative h-12 w-full overflow-hidden rounded-md border border-border bg-muted/50">
                          {u.latest_screenshot?.id ? (
                            u.latest_screenshot.thumb_signed_url ||
                            u.latest_screenshot.signed_url ? (
                              <Image
                                src={
                                  u.latest_screenshot.thumb_signed_url ??
                                  u.latest_screenshot.signed_url!
                                }
                                alt=""
                                fill
                                className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
                                unoptimized
                                sizes="120px"
                              />
                            ) : (
                              <AuthScreenshotThumb
                                screenshotId={u.latest_screenshot.id}
                                className="h-full w-full object-cover opacity-90"
                                fallback={
                                  <span className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground/80">
                                    No preview
                                  </span>
                                }
                              />
                            )
                          ) : (
                            <span
                              className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground/75"
                              title={
                                u.last_active
                                  ? 'No screenshot yet. Confirm storage credentials so the desktop app can upload captures.'
                                  : undefined
                              }
                            >
                              {u.last_active ? 'No shot' : '—'}
                            </span>
                          )}
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
                    <td className="px-4 py-3 align-top">
                      <TimeCell seconds={u.today_seconds} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TimeCell seconds={u.yesterday_seconds} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TimeCell seconds={u.this_week_seconds} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TimeCell seconds={u.this_month_seconds} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
