'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Globe,
  Link2,
  Search,
  Settings,
  Shield,
  UserCog,
} from 'lucide-react'
import { api } from '@/lib/api'
import { InitialsAvatar } from '@/components/ui/initials-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/* ─── Types ──────────────────────────────────────────────────────────────────── */

type AuditLog = {
  id: string
  org_id: string
  actor_id: string
  action: string
  target_type: string | null
  target_id: string | null
  old_value: unknown
  new_value: unknown
  ip: string | null
  created_at: string
  actor?: { id: string; name: string; email: string } | null
}

type TeamUser = { id: string; name: string; email: string }

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

type ActionCategory = 'settings' | 'user' | 'security' | 'integration' | 'other'

function classifyAction(action: string): ActionCategory {
  const a = action.toLowerCase()
  if (
    a.includes('setting') ||
    a.includes('screenshot') ||
    a.includes('weight') ||
    a.includes('interval')
  )
    return 'settings'
  if (
    a.includes('user') ||
    a.includes('invite') ||
    a.includes('role') ||
    a.includes('suspend') ||
    a.includes('team')
  )
    return 'user'
  if (
    a.includes('mfa') ||
    a.includes('password') ||
    a.includes('login') ||
    a.includes('security') ||
    a.includes('session')
  )
    return 'security'
  if (
    a.includes('jira') ||
    a.includes('asana') ||
    a.includes('integration') ||
    a.includes('connect') ||
    a.includes('token')
  )
    return 'integration'
  return 'other'
}

const CATEGORY_COLORS: Record<ActionCategory, { bg: string; text: string; icon: typeof Settings }> =
  {
    settings: { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-400', icon: Settings },
    user: { bg: 'bg-violet-500/15', text: 'text-violet-700 dark:text-violet-400', icon: UserCog },
    security: { bg: 'bg-red-500/15', text: 'text-red-700 dark:text-red-400', icon: Shield },
    integration: {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-400',
      icon: Link2,
    },
    other: { bg: 'bg-muted', text: 'text-muted-foreground', icon: Globe },
  }

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function groupByDay(logs: AuditLog[]): { label: string; items: AuditLog[] }[] {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  const groups = new Map<string, AuditLog[]>()
  for (const log of logs) {
    const d = new Date(log.created_at)
    let label: string
    if (d.toDateString() === today) label = 'Today'
    else if (d.toDateString() === yesterday) label = 'Yesterday'
    else label = d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
    const list = groups.get(label) ?? []
    list.push(log)
    groups.set(label, list)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

function prettyJson(val: unknown): string {
  if (val == null) return 'null'
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

/* ─── Action Chip ────────────────────────────────────────────────────────────── */

function ActionChip({ action }: { action: string }) {
  const cat = classifyAction(action)
  const { bg, text, icon: Icon } = CATEGORY_COLORS[cat]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        bg,
        text
      )}
    >
      <Icon className="h-3 w-3" />
      {action.replace(/\./g, ' ')}
    </span>
  )
}

/* ─── Log Row ────────────────────────────────────────────────────────────────── */

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasValues = log.old_value != null || log.new_value != null

  function copyDiff() {
    const text = `Old:\n${prettyJson(log.old_value)}\n\nNew:\n${prettyJson(log.new_value)}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => hasValues && setExpanded((e) => !e)}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
          hasValues && 'cursor-pointer hover:bg-muted/40',
          !hasValues && 'cursor-default'
        )}
      >
        <div className="mt-0.5 shrink-0">
          <InitialsAvatar name={log.actor?.name ?? '?'} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {log.actor?.name ?? 'System'}
            </span>
            <ActionChip action={log.action} />
          </div>
          {log.target_type && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {log.target_type}
              {log.target_id ? ` · ${log.target_id.slice(0, 8)}…` : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {log.ip && (
            <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
              {log.ip}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{relativeTime(log.created_at)}</span>
          {hasValues &&
            (expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ))}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-3 mb-2 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                    Old value
                  </span>
                </div>
                <pre className="max-h-48 overflow-auto rounded-md bg-red-500/5 p-2 font-mono text-xs text-foreground">
                  {prettyJson(log.old_value)}
                </pre>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    New value
                  </span>
                </div>
                <pre className="max-h-48 overflow-auto rounded-md bg-emerald-500/5 p-2 font-mono text-xs text-foreground">
                  {prettyJson(log.new_value)}
                </pre>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    copyDiff()
                  }}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ClipboardCopy className="h-3 w-3" />
                  Copy diff
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */

const ACTION_CATEGORIES: { key: string; label: string }[] = [
  { key: '', label: 'All actions' },
  { key: 'settings', label: 'Settings' },
  { key: 'user', label: 'Users' },
  { key: 'security', label: 'Security' },
  { key: 'integration', label: 'Integrations' },
]

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [textSearch, setTextSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [users, setUsers] = useState<TeamUser[]>([])

  useEffect(() => {
    api
      .get<{ users: TeamUser[] }>('/v1/admin/users', { params: { limit: 100 } })
      .then(({ data }) => setUsers(data.users ?? []))
      .catch(() => {})
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' }
      if (actorFilter) params.actor_id = actorFilter
      if (actionFilter) params.action = actionFilter
      if (textSearch) params.action = textSearch
      if (dateFrom) params.from = new Date(dateFrom + 'T00:00:00').toISOString()
      if (dateTo) params.to = new Date(dateTo + 'T23:59:59').toISOString()
      const { data } = await api.get<{ logs: AuditLog[]; total: number }>('/v1/admin/audit-log', {
        params,
      })
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [page, actorFilter, actionFilter, textSearch, dateFrom, dateTo])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const filteredLogs = useMemo(() => {
    if (!actionFilter) return logs
    return logs.filter((l) => classifyAction(l.action) === actionFilter)
  }, [logs, actionFilter])

  const grouped = groupByDay(filteredLogs)
  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 text-xl font-bold tracking-tight">Audit Log</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Track all changes and actions in your organization.
      </p>

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Actor
          <select
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value)
              setPage(1)
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Action type
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {ACTION_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search actions…"
              value={textSearch}
              onChange={(e) => {
                setTextSearch(e.target.value)
                setPage(1)
              }}
              className="rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-sm"
            />
          </div>
        </label>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <p className="text-sm text-muted-foreground">No audit log entries match your filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="space-y-1">
                {group.items.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} entries)
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
