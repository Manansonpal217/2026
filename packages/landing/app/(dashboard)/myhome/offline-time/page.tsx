'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { format, differenceInMinutes } from 'date-fns'
import { isAxiosError } from 'axios'
import { Clock, ExternalLink } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { normalizeOrgRole, isManagerOrAbove } from '@/lib/roles'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────────────────────────────

type OfflineTimeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'

interface OfflineTimeEntry {
  id: string
  org_id: string
  user_id: string
  requested_by_id: string
  approver_id: string | null
  source: 'REQUEST' | 'DIRECT_ADD'
  status: OfflineTimeStatus
  start_time: string
  end_time: string
  description: string
  approver_note: string | null
  expires_at: string | null
  created_at: string
  approver?: { id: string; name: string } | null
  user?: { id: string; name: string; email: string }
  requested_by?: { id: string; name: string }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const STATUS_BORDER: Record<OfflineTimeStatus, string> = {
  PENDING: 'border-l-amber-500',
  APPROVED: 'border-l-emerald-500',
  REJECTED: 'border-l-red-500',
  EXPIRED: 'border-l-slate-400',
}

const STATUS_BADGE: Record<OfflineTimeStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'bg-red-500/15 text-red-700 dark:text-red-400',
  EXPIRED: 'bg-slate-400/15 text-slate-600 dark:text-slate-400',
}

function formatDuration(start: string, end: string): string {
  const mins = differenceInMinutes(new Date(end), new Date(start))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')) {
    return `${format(s, 'MMM d, yyyy')} ${format(s, 'HH:mm')} – ${format(e, 'HH:mm')}`
  }
  return `${format(s, 'MMM d HH:mm')} – ${format(e, 'MMM d HH:mm, yyyy')}`
}

// ── Timeline (my entries) ───────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  )
}

function OfflineTimeTimeline({
  entries,
  loading,
  page,
  total,
  pageSize,
  onPageChange,
}: {
  entries: OfflineTimeEntry[]
  loading: boolean
  page: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
}) {
  if (loading) return <TimelineSkeleton />
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-card py-16 text-center">
        <Clock className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No offline time entries yet</p>
      </div>
    )
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className={`rounded-xl border border-border/60 bg-card shadow-sm border-l-4 ${STATUS_BORDER[e.status]} p-4`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm tabular-nums">
                    {formatRange(e.start_time, e.end_time)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    ({formatDuration(e.start_time, e.end_time)})
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground/80">{e.description}</p>
                {e.status === 'REJECTED' && e.approver_note && (
                  <p className="mt-1 text-xs italic text-red-600 dark:text-red-400">
                    {e.approver_note}
                  </p>
                )}
                {e.approver && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.status === 'APPROVED'
                      ? 'Approved'
                      : e.status === 'REJECTED'
                        ? 'Rejected'
                        : 'Resolved'}{' '}
                    by {e.approver.name}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status]}`}
              >
                {e.status}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Pending approvals (managers) ────────────────────────────────────────────────

function PendingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  )
}

function PendingApprovalsQueue({
  entries,
  loading,
  onChanged,
}: {
  entries: OfflineTimeEntry[]
  loading: boolean
  onChanged: () => void
}) {
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const approve = async (id: string) => {
    setActionError(null)
    setActingId(id)
    try {
      await api.patch(`/v1/app/offline-time/${id}/approve`, {})
      onChanged()
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const data = err.response?.data as { message?: string; resolver_name?: string } | undefined
        setActionError(
          data?.message ??
            (err.response?.status === 409
              ? `Already resolved${data?.resolver_name ? ` by ${data.resolver_name}` : ''}`
              : 'Could not approve')
        )
      } else {
        setActionError(err instanceof Error ? err.message : 'Could not approve')
      }
    } finally {
      setActingId(null)
    }
  }

  const reject = async (id: string) => {
    const note = rejectNote.trim()
    if (!note) {
      setActionError('A short reason is required when rejecting.')
      return
    }
    setActionError(null)
    setActingId(id)
    try {
      await api.patch(`/v1/app/offline-time/${id}/reject`, { approver_note: note })
      setRejectingId(null)
      setRejectNote('')
      onChanged()
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const data = err.response?.data as { message?: string; resolver_name?: string } | undefined
        setActionError(
          data?.message ??
            (err.response?.status === 409
              ? `Already resolved${data?.resolver_name ? ` by ${data.resolver_name}` : ''}`
              : 'Could not reject')
        )
      } else {
        setActionError(err instanceof Error ? err.message : 'Could not reject')
      }
    } finally {
      setActingId(null)
    }
  }

  if (loading) return <PendingSkeleton />

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-14 text-center">
        <p className="text-sm font-medium text-foreground">No pending requests</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          When someone on your team submits offline or manual time, it will appear here for you to
          approve or reject. You&apos;ll also get a notification.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {entries.map((e) => {
          const u = e.user
          const busy = actingId === e.id
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-border/60 bg-card shadow-sm border-l-4 border-l-amber-500 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-semibold text-foreground">
                      {u?.name ?? 'Team member'}
                    </span>
                    {u?.email ? (
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    ) : null}
                  </div>
                  {u?.id ? (
                    <Link
                      href={`/myhome/${u.id}`}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Open day activity
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm tabular-nums text-foreground/90">
                      {formatRange(e.start_time, e.end_time)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      ({formatDuration(e.start_time, e.end_time)})
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/90">{e.description}</p>
                  {e.requested_by && e.requested_by.id !== e.user_id ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested by {e.requested_by.name}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  {rejectingId === e.id ? (
                    <div className="w-full min-w-[min(100%,280px)] space-y-2">
                      <label className="grid gap-1 text-left text-xs text-muted-foreground">
                        Reason for rejection (shown to the employee)
                        <textarea
                          value={rejectNote}
                          onChange={(ev) => setRejectNote(ev.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                          disabled={busy}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10"
                          disabled={busy || !rejectNote.trim()}
                          onClick={() => void reject(e.id)}
                        >
                          {busy ? 'Submitting…' : 'Confirm reject'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setRejectingId(null)
                            setRejectNote('')
                            setActionError(null)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || rejectingId !== null}
                        onClick={() => void approve(e.id)}
                      >
                        {busy ? 'Working…' : 'Approve'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || (rejectingId !== null && rejectingId !== e.id)}
                        onClick={() => {
                          setRejectingId(e.id)
                          setRejectNote('')
                          setActionError(null)
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────

type ManagerTab = 'approvals' | 'mine'

export default function OfflineTimePage() {
  const { data: session, status: sessionStatus } = useSession()
  const sessionRole = normalizeOrgRole(session?.user?.role as string | undefined)
  const showApproverUi = isManagerOrAbove(sessionRole)

  const [managerTab, setManagerTab] = useState<ManagerTab>('approvals')

  const [entries, setEntries] = useState<OfflineTimeEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingEntries, setLoadingEntries] = useState(true)

  const [pending, setPending] = useState<OfflineTimeEntry[]>([])
  const [loadingPending, setLoadingPending] = useState(false)

  const fetchEntries = useCallback(async (p: number) => {
    setLoadingEntries(true)
    try {
      const res = await api.get('/v1/app/offline-time', { params: { page: p } })
      setEntries(res.data.offline_time)
      setTotal(res.data.total)
      setPage(p)
    } catch {
      /* noop */
    } finally {
      setLoadingEntries(false)
    }
  }, [])

  const fetchPending = useCallback(async () => {
    if (!showApproverUi) return
    setLoadingPending(true)
    try {
      const res = await api.get<{ pending: OfflineTimeEntry[]; count: number }>(
        '/v1/app/offline-time/pending'
      )
      setPending(res.data.pending ?? [])
    } catch {
      setPending([])
    } finally {
      setLoadingPending(false)
    }
  }, [showApproverUi])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    void fetchEntries(1)
  }, [fetchEntries, sessionStatus])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !showApproverUi) return
    void fetchPending()
  }, [fetchPending, sessionStatus, showApproverUi])

  const onPendingChanged = useCallback(() => {
    void fetchPending()
    void fetchEntries(page)
  }, [fetchPending, fetchEntries, page])

  const pendingCount = pending.length

  return (
    <div
      className={cn(
        'relative isolate mx-auto w-full px-4 py-8 sm:px-6 lg:px-8',
        showApproverUi ? 'max-w-4xl' : 'max-w-3xl'
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
        <div className="absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full bg-amber-500/[0.09] blur-3xl dark:bg-amber-500/[0.12]" />
        <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/[0.12]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.35] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_100%)] dark:opacity-[0.2]" />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Offline time</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {showApproverUi ? (
            <>
              Review pending team requests, or switch to{' '}
              <span className="font-medium text-foreground">My offline time</span> for your own
              entries. To add time for yourself or your team, use a person&apos;s day on{' '}
              <span className="font-medium text-foreground">Home</span>.
            </>
          ) : (
            <>
              Your offline and manual time (all statuses). Add entries from a day on your{' '}
              <span className="font-medium text-foreground">Home</span> profile.
            </>
          )}
        </p>
      </div>

      {showApproverUi ? (
        <div className="mb-6 flex gap-1 rounded-lg border border-border/80 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setManagerTab('approvals')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              managerTab === 'approvals'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Approvals
            {pendingCount > 0 ? (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                ({pendingCount})
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setManagerTab('mine')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              managerTab === 'mine'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            My offline time
          </button>
        </div>
      ) : null}

      {showApproverUi && managerTab === 'approvals' ? (
        <PendingApprovalsQueue
          entries={pending}
          loading={loadingPending}
          onChanged={onPendingChanged}
        />
      ) : (
        <OfflineTimeTimeline
          entries={entries}
          loading={loadingEntries}
          page={page}
          total={total}
          pageSize={20}
          onPageChange={(p) => void fetchEntries(p)}
        />
      )}
    </div>
  )
}
