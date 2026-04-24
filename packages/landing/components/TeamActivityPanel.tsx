'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { formatDurationSeconds, formatRelativeFromIso } from '@/lib/format'
import { normalizeOrgRole } from '@/lib/roles'
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

function TimeCell({ seconds }: { seconds: number }) {
  const hasTime = seconds > 0
  return (
    <div
      className={cn(
        'min-w-[6rem] tabular-nums text-base',
        hasTime ? 'font-semibold text-foreground' : 'text-muted-foreground'
      )}
    >
      {formatDurationSeconds(seconds)}
    </div>
  )
}

type OrgOption = { id: string; name: string }

export function TeamActivityPanel() {
  const router = useRouter()
  const { data: session } = useSession()
  const selfId = (session?.user as { id?: string } | undefined)?.id
  const isPlatformAdmin = session?.user?.is_platform_admin === true
  const sessionRole = normalizeOrgRole(session?.user?.role as string | undefined)
  const showLastActiveSort = sessionRole !== 'employee'

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
    const others = rows.filter((u) => u.id !== selfId)
    others.sort((a, b) => {
      const ta = a.last_active ? new Date(a.last_active).getTime() : 0
      const tb = b.last_active ? new Date(b.last_active).getTime() : 0
      const cmp = ta - tb
      return sortDir === 'asc' ? cmp : -cmp
    })
    const self = selfId ? rows.find((u) => u.id === selfId) : undefined
    return self ? [self, ...others] : others
  }, [rows, sortDir, selfId])

  const showOrgColumn = isPlatformAdmin

  return (
    <section aria-label="Activity">
      {isPlatformAdmin ? (
        <div className="mb-5 flex justify-end">
          <label className="flex min-w-0 max-w-full flex-col gap-1.5 text-sm sm:max-w-xs">
            <span className="font-medium text-foreground/90">Organization</span>
            <select
              className="h-9 w-full rounded-lg border border-border/80 bg-card/80 px-3 text-foreground shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              aria-label="Filter activity by organization"
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-lg shadow-primary/[0.04] ring-1 ring-border/40">
        {err ? (
          <p className="p-6 text-base text-destructive">{err}</p>
        ) : loading ? (
          <div className="p-6">
            <div className="mb-4 flex gap-4 border-b border-border pb-4">
              {isPlatformAdmin ? <Skeleton className="h-11 max-w-[220px]" /> : null}
              <Skeleton className="h-14 min-w-[240px] flex-1" />
              <Skeleton className="h-12 w-[12rem] shrink-0" />
              <Skeleton className="h-11 w-28" />
              <Skeleton className="h-11 w-28" />
              <Skeleton className="h-11 w-32" />
              <Skeleton className="h-11 w-32" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border py-4 last:border-0"
              >
                {isPlatformAdmin ? <Skeleton className="h-11 w-28 shrink-0" /> : null}
                <Skeleton className="h-14 min-w-[240px] flex-1" />
                <Skeleton className="h-28 w-[12rem] shrink-0" />
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 sm:p-12">
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-primary/25 bg-gradient-to-b from-primary/[0.06] to-muted/20 px-6 py-10 text-center shadow-sm">
              <p className="text-base font-semibold text-foreground">No team members yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                When users are added to your organization, they&apos;ll appear here with time totals
                and last activity.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className={cn(
                'w-full border-collapse text-left text-base',
                showOrgColumn ? 'min-w-[1090px]' : 'min-w-[1010px]'
              )}
            >
              <thead>
                <tr className="border-b border-border/80 bg-gradient-to-r from-muted/90 via-muted/60 to-primary/[0.06] text-muted-foreground">
                  {showOrgColumn ? (
                    <th className="px-5 py-4 text-base font-semibold text-foreground/85">
                      Organization
                    </th>
                  ) : null}
                  <th className="group/th min-w-[16rem] px-5 py-4 text-base font-semibold text-foreground">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span>Employee</span>
                      {showLastActiveSort ? (
                        <button
                          type="button"
                          title={
                            sortDir === 'asc'
                              ? 'Sorted oldest last active first — click for newest first'
                              : 'Sorted newest last active first — click for oldest first'
                          }
                          className={cn(
                            'inline-flex items-center rounded-md p-1.5 text-muted-foreground',
                            'opacity-0 transition-opacity hover:bg-muted hover:text-foreground',
                            'group-hover/th:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                          )}
                          aria-label={
                            sortDir === 'asc'
                              ? 'Sort by last active: oldest first. Activate to sort newest first'
                              : 'Sort by last active: newest first. Activate to sort oldest first'
                          }
                          onClick={(e) => {
                            e.stopPropagation()
                            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                          }}
                        >
                          {sortDir === 'asc' ? (
                            <ArrowUp className="h-4 w-4" aria-hidden />
                          ) : (
                            <ArrowDown className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="w-[12rem] min-w-[12rem] px-3 py-4 text-base font-semibold text-foreground"
                  >
                    <span className="sr-only">Last screenshot</span>
                  </th>
                  <th className="px-5 py-4 text-base font-semibold text-foreground">Today</th>
                  <th className="px-5 py-4 text-base font-semibold text-foreground">Yesterday</th>
                  <th className="px-5 py-4 text-base font-semibold text-foreground">This week</th>
                  <th className="px-5 py-4 text-base font-semibold text-foreground">This month</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => (
                  <tr
                    key={u.id}
                    tabIndex={0}
                    aria-label={`View activity for ${u.name}`}
                    className={cn(
                      'group cursor-pointer border-b border-border/70 transition-colors',
                      'hover:bg-primary/[0.04] hover:shadow-[inset_3px_0_0_0_hsl(var(--primary)/0.45)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    )}
                    onClick={() => router.push(`/myhome/${u.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/myhome/${u.id}`)
                      }
                    }}
                  >
                    {showOrgColumn ? (
                      <td className="max-w-[11rem] truncate px-5 py-4 text-base text-muted-foreground">
                        {u.org_name ?? '—'}
                      </td>
                    ) : null}
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-4">
                        <Avatar name={u.name} size="xl" className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <span
                              className={cn(
                                'h-2.5 w-2.5 shrink-0 rounded-full',
                                u.is_online ? 'bg-emerald-500' : 'bg-muted-foreground/35'
                              )}
                              title={u.is_online ? 'Online' : 'Offline'}
                            />
                            <span className="text-base font-semibold text-primary group-hover:underline">
                              {u.name}
                            </span>
                          </div>
                          <p
                            className="mt-1 text-sm leading-snug text-muted-foreground"
                            suppressHydrationWarning
                          >
                            {u.last_active ? (
                              <>
                                <span className="text-muted-foreground/85">Last active</span>
                                <span aria-hidden> · </span>
                                <span className="tabular-nums text-foreground/80">
                                  {formatRelativeFromIso(u.last_active)}
                                </span>
                              </>
                            ) : (
                              <span>No activity recorded</span>
                            )}
                          </p>
                          {u.last_active ? (
                            <span className="sr-only">
                              Last active{' '}
                              {new Date(u.last_active).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                hour12: true,
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="w-[12rem] min-w-[12rem] px-3 py-4 align-top">
                      <div className="relative h-28 w-full overflow-hidden rounded-lg border border-border/80 bg-gradient-to-br from-muted/70 to-muted/40 shadow-inner ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
                        {u.latest_screenshot?.id ? (
                          u.latest_screenshot.thumb_signed_url || u.latest_screenshot.signed_url ? (
                            <Image
                              src={
                                u.latest_screenshot.thumb_signed_url ??
                                u.latest_screenshot.signed_url!
                              }
                              alt=""
                              fill
                              className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
                              unoptimized
                              sizes="280px"
                            />
                          ) : (
                            <AuthScreenshotThumb
                              screenshotId={u.latest_screenshot.id}
                              className="h-full w-full object-cover opacity-90"
                              fallback={
                                <span className="flex h-full items-center justify-center px-1.5 text-center text-xs text-muted-foreground/80">
                                  No preview
                                </span>
                              }
                            />
                          )
                        ) : (
                          <span
                            className="flex h-full items-center justify-center px-1.5 text-center text-xs text-muted-foreground/75"
                            title={u.last_active ? 'No screenshot yet' : undefined}
                          >
                            {u.last_active ? 'No shot' : '—'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <TimeCell seconds={u.today_seconds} />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <TimeCell seconds={u.yesterday_seconds} />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <TimeCell seconds={u.this_week_seconds} />
                    </td>
                    <td className="px-5 py-4 align-top">
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
