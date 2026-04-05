'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, differenceInMinutes, subDays, isAfter, isBefore } from 'date-fns'
import { Clock, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { isManagerOrAbove, normalizeOrgRole } from '@/lib/roles'
import { InitialsAvatar } from '@/components/ui/initials-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

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

// ── Timeline Component ──────────────────────────────────────────────────────────

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

// ── Submit Form Component ───────────────────────────────────────────────────────

function SubmitRequestForm({
  approvedEntries,
  onSubmitted,
}: {
  approvedEntries: OfflineTimeEntry[]
  onSubmitted: () => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const min30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  const [selectedDate, setSelectedDate] = useState(today)
  const [startHour, setStartHour] = useState(9)
  const [startMin, setStartMin] = useState(0)
  const [endHour, setEndHour] = useState(10)
  const [endMin, setEndMin] = useState(0)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (ev: React.FormEvent) => {
      ev.preventDefault()
      setError(null)

      const start = new Date(
        `${selectedDate}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`
      )
      const end = new Date(
        `${selectedDate}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`
      )

      if (end <= start) {
        setError('End time must be after start time')
        return
      }
      if (isAfter(end, new Date())) {
        setError('End time cannot be in the future')
        return
      }
      if (isBefore(start, subDays(new Date(), 30))) {
        setError('Start time cannot be more than 30 days ago')
        return
      }

      const hasOverlap = approvedEntries.some((e) => {
        const eStart = new Date(e.start_time)
        const eEnd = new Date(e.end_time)
        return end > eStart && start < eEnd
      })
      if (hasOverlap) {
        setError('This time range overlaps with an existing approved entry')
        return
      }

      setSubmitting(true)
      try {
        await api.post('/v1/app/offline-time/request', {
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description,
        })
        setDescription('')
        onSubmitted()
      } catch (err: unknown) {
        const axErr = err as { response?: { data?: { code?: string; message?: string } } }
        setError(axErr.response?.data?.message ?? 'Failed to submit request')
      } finally {
        setSubmitting(false)
      }
    },
    [selectedDate, startHour, startMin, endHour, endMin, description, approvedEntries, onSubmitted]
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
    >
      <h3 className="mb-3 font-semibold text-sm">Submit Offline Time Request</h3>

      <label className="mb-1 block text-xs text-muted-foreground">Date</label>
      <input
        type="date"
        value={selectedDate}
        min={min30}
        max={today}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="mb-3 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Start</label>
          <div className="flex gap-1">
            <input
              type="number"
              min={0}
              max={23}
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
            <span className="self-center text-muted-foreground">:</span>
            <input
              type="number"
              min={0}
              max={59}
              step={5}
              value={startMin}
              onChange={(e) => setStartMin(Number(e.target.value))}
              className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">End</label>
          <div className="flex gap-1">
            <input
              type="number"
              min={0}
              max={23}
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
            <span className="self-center text-muted-foreground">:</span>
            <input
              type="number"
              min={0}
              max={59}
              step={5}
              value={endMin}
              onChange={(e) => setEndMin(Number(e.target.value))}
              className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
          </div>
        </div>
      </div>

      <label className="mb-1 block text-xs text-muted-foreground">Reason</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 200))}
        maxLength={200}
        rows={2}
        className="mb-1 block w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        placeholder="What were you working on?"
      />
      <p className="mb-3 text-right text-[10px] text-muted-foreground">{description.length}/200</p>

      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting || description.length === 0}>
        {submitting ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Submitting...
          </span>
        ) : (
          'Submit Request'
        )}
      </Button>
    </form>
  )
}

// ── Manager Pending Panel ───────────────────────────────────────────────────────

function PendingCard({ entry, onResolved }: { entry: OfflineTimeEntry; onResolved: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [resolvedBy, setResolvedBy] = useState<string | null>(null)

  const handleApprove = useCallback(async () => {
    setLoading(true)
    try {
      await api.patch(`/v1/app/offline-time/${entry.id}/approve`, {})
      onResolved()
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: { resolver?: string } } }
      if (axErr.response?.status === 409) {
        setResolvedBy(axErr.response.data?.resolver ?? 'someone')
      }
    } finally {
      setLoading(false)
    }
  }, [entry.id, onResolved])

  const handleReject = useCallback(async () => {
    if (!note.trim()) return
    setLoading(true)
    try {
      await api.patch(`/v1/app/offline-time/${entry.id}/reject`, { approver_note: note })
      onResolved()
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: { resolver?: string } } }
      if (axErr.response?.status === 409) {
        setResolvedBy(axErr.response.data?.resolver ?? 'someone')
      }
    } finally {
      setLoading(false)
    }
  }, [entry.id, note, onResolved])

  if (resolvedBy) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/30 p-4 opacity-60">
        <p className="text-xs text-muted-foreground">Resolved by {resolvedBy}</p>
      </div>
    )
  }

  const userName = entry.user?.name ?? 'Unknown'
  const descTruncated = entry.description.length > 80

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <InitialsAvatar name={userName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{userName}</p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatRange(entry.start_time, entry.end_time)} (
            {formatDuration(entry.start_time, entry.end_time)})
          </p>
          <p
            className={`mt-1 text-xs text-foreground/80 ${!expanded && descTruncated ? 'line-clamp-2' : ''}`}
          >
            {entry.description}
          </p>
          {descTruncated && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-0.5 flex items-center gap-0.5 text-[10px] text-brand-primary hover:underline"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </div>

      {!rejectMode ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejectMode(true)}
            disabled={loading}
            className="flex-1 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mb-2 block w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
            placeholder="Reason for rejection (required)"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejectMode(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={handleReject}
              disabled={loading || note.trim().length === 0}
              className="flex-1 bg-red-600 text-white hover:bg-red-700"
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ManagerPendingPanel({
  entries,
  loading,
  onResolved,
}: {
  entries: OfflineTimeEntry[]
  loading: boolean
  onResolved: () => void
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold text-sm">Pending Approvals</h3>
        {entries.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {entries.length}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <p className="text-xs text-muted-foreground">No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <PendingCard key={e.id} entry={e} onResolved={onResolved} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function OfflineTimePage() {
  const { data: session } = useSession()
  const role = normalizeOrgRole((session?.user as { role?: string } | undefined)?.role)
  const showManagerPanel = isManagerOrAbove(role)

  const [entries, setEntries] = useState<OfflineTimeEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingEntries, setLoadingEntries] = useState(true)

  const [pending, setPending] = useState<OfflineTimeEntry[]>([])
  const [loadingPending, setLoadingPending] = useState(true)

  const approvedEntries = useMemo(() => entries.filter((e) => e.status === 'APPROVED'), [entries])

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
    if (!showManagerPanel) return
    setLoadingPending(true)
    try {
      const res = await api.get('/v1/app/offline-time/pending')
      setPending(res.data.pending)
    } catch {
      /* noop */
    } finally {
      setLoadingPending(false)
    }
  }, [showManagerPanel])

  useEffect(() => {
    fetchEntries(1)
  }, [fetchEntries])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleSubmitted = useCallback(() => {
    fetchEntries(1)
    fetchPending()
  }, [fetchEntries, fetchPending])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Offline Time</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track and manage your offline work hours
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left panel — Timeline (60%) */}
        <div className="min-w-0 flex-[3]">
          <OfflineTimeTimeline
            entries={entries}
            loading={loadingEntries}
            page={page}
            total={total}
            pageSize={20}
            onPageChange={(p) => fetchEntries(p)}
          />
        </div>

        {/* Right panel — Actions (40%) */}
        <div className="flex flex-col gap-6 lg:w-[40%] lg:max-w-md">
          <SubmitRequestForm approvedEntries={approvedEntries} onSubmitted={handleSubmitted} />

          {showManagerPanel && (
            <ManagerPendingPanel
              entries={pending}
              loading={loadingPending}
              onResolved={handleSubmitted}
            />
          )}
        </div>
      </div>
    </div>
  )
}
