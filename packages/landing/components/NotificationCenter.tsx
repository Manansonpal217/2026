'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, CheckCircle2, Clock, CreditCard, Info, Timer, X } from 'lucide-react'
import { api } from '@/lib/api'
import { isManagerOrAbove } from '@/lib/roles'
import { useNotificationStore } from '@/stores/notificationStore'
import type { AppNotification } from '@/stores/notificationStore'
import { cn } from '@/lib/utils'

type NotifPayload = {
  offline_time_id?: string
  user_name?: string
  requester_name?: string
  approver_name?: string
  date?: string
  hours?: number
  note?: string
  plan?: string
  resolver_name?: string
}

function parsePayload(n: AppNotification): NotifPayload {
  if (!n.payload || typeof n.payload !== 'object') return {}
  return n.payload as NotifPayload
}

function iconForType(type: string) {
  switch (type) {
    case 'OFFLINE_TIME_SUBMITTED':
      return <Clock className="h-4 w-4 text-blue-500" />
    case 'OFFLINE_TIME_APPROVED':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'OFFLINE_TIME_REJECTED':
      return <X className="h-4 w-4 text-red-500" />
    case 'OFFLINE_TIME_EXPIRED':
      return <Timer className="h-4 w-4 text-gray-500" />
    case 'OFFLINE_TIME_ALREADY_RESOLVED':
      return <Info className="h-4 w-4 text-amber-500" />
    case 'PAYMENT_DUE':
      return <CreditCard className="h-4 w-4 text-amber-500" />
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />
  }
}

function textForType(type: string, p: NotifPayload): string {
  const name = p.requester_name || p.user_name || 'Someone'
  const approver = p.approver_name || 'a manager'
  const date = p.date || 'a date'
  const hours = p.hours != null ? `${p.hours}h` : 'some'
  switch (type) {
    case 'OFFLINE_TIME_SUBMITTED':
      return `${name} requested ${hours} offline on ${date}`
    case 'OFFLINE_TIME_APPROVED':
      return `Your request for ${date} was approved by ${approver}`
    case 'OFFLINE_TIME_REJECTED':
      return `Your request for ${date} was rejected${p.note ? ` — ${p.note}` : ''}`
    case 'OFFLINE_TIME_EXPIRED':
      return `Your request for ${date} expired without review`
    case 'OFFLINE_TIME_ALREADY_RESOLVED':
      return `${p.resolver_name || 'Someone'} already resolved this request`
    case 'PAYMENT_DUE':
      return `Payment due on ${date} — ${p.plan || ''} plan`
    default:
      return type.replace(/_/g, ' ').toLowerCase()
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function groupByDate(ns: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const todayKey = today.toDateString()
  const yesterdayKey = yesterday.toDateString()

  const groups = new Map<string, AppNotification[]>()
  for (const n of ns) {
    const d = new Date(n.created_at)
    let label: string
    if (d.toDateString() === todayKey) label = 'Today'
    else if (d.toDateString() === yesterdayKey) label = 'Yesterday'
    else label = d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
    const list = groups.get(label) ?? []
    list.push(n)
    groups.set(label, list)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

function NotificationCard({
  n,
  isManager,
  onDismiss,
}: {
  n: AppNotification
  isManager: boolean
  onDismiss: (id: string) => void
}) {
  const p = parsePayload(n)
  const { markRead } = useNotificationStore()
  const [actionState, setActionState] = useState<
    'idle' | 'approving' | 'rejecting' | 'reject-form' | 'resolved' | 'conflict'
  >('idle')
  const [rejectNote, setRejectNote] = useState('')
  const [conflictName, setConflictName] = useState('')

  const showInlineActions =
    n.type === 'OFFLINE_TIME_SUBMITTED' &&
    isManager &&
    p.offline_time_id &&
    actionState !== 'resolved' &&
    actionState !== 'conflict'

  async function handleApprove() {
    if (!p.offline_time_id) return
    setActionState('approving')
    try {
      await api.patch(`/v1/app/offline-time/${p.offline_time_id}/approve`)
      markRead(n.id)
      setActionState('resolved')
      setTimeout(() => onDismiss(n.id), 1500)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        const data = (err as { response?: { data?: { resolver_name?: string } } })?.response?.data
        setConflictName(data?.resolver_name ?? 'someone')
        setActionState('conflict')
      } else {
        setActionState('idle')
      }
    }
  }

  async function handleReject() {
    if (!p.offline_time_id || !rejectNote.trim()) return
    setActionState('rejecting')
    try {
      await api.patch(`/v1/app/offline-time/${p.offline_time_id}/reject`, {
        approver_note: rejectNote.trim(),
      })
      markRead(n.id)
      setActionState('resolved')
      setTimeout(() => onDismiss(n.id), 1500)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        const data = (err as { response?: { data?: { resolver_name?: string } } })?.response?.data
        setConflictName(data?.resolver_name ?? 'someone')
        setActionState('conflict')
      } else {
        setActionState('reject-form')
      }
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'overflow-hidden rounded-lg border border-border/60 px-3 py-2.5',
        !n.read_at ? 'bg-muted/50' : 'bg-background/30'
      )}
      onClick={() => {
        if (!n.read_at) markRead(n.id)
      }}
    >
      <div className="flex gap-2.5">
        <div className="mt-0.5 shrink-0">{iconForType(n.type)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground leading-snug">{textForType(n.type, p)}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{relativeTime(n.created_at)}</p>

          {actionState === 'resolved' && (
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Done
            </p>
          )}
          {actionState === 'conflict' && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Resolved by {conflictName}
            </p>
          )}

          {showInlineActions && actionState === 'idle' && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleApprove()
                }}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActionState('reject-form')
                }}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          )}

          {showInlineActions && actionState === 'reject-form' && (
            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Reason for rejection..."
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!rejectNote.trim()}
                  onClick={() => void handleReject()}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => setActionState('idle')}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(actionState === 'approving' || actionState === 'rejecting') && (
            <p className="mt-1 text-xs text-muted-foreground">Processing…</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const isManager = isManagerOrAbove(role)
  const { notifications, markAllRead } = useNotificationStore()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((s) => new Set(s).add(id))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const visibleNotifs = notifications.filter((n) => !dismissedIds.has(n.id))
  const grouped = groupByDate(visibleNotifs)

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[190] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            key="panel"
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-[200] flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {visibleNotifs.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No notifications yet.
                </p>
              ) : (
                grouped.map((group) => (
                  <div key={group.label} className="mb-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {group.items.map((n) => (
                          <NotificationCard
                            key={n.id}
                            n={n}
                            isManager={isManager}
                            onDismiss={handleDismiss}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
