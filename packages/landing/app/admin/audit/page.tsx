'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  ScrollText,
  Search,
  User,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type AuditEntry = {
  id: string
  actor_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
  actor?: { id: string; name: string; email: string } | null
}

type OrgOption = { id: string; name: string; slug: string }

const ACTION_STYLES: Record<string, string> = {
  created: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  updated: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  deleted: 'bg-red-500/15 text-red-700 dark:text-red-400',
  suspended: 'bg-red-500/15 text-red-700 dark:text-red-400',
  changed: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

function actionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_STYLES)) {
    if (action.includes(key)) return cls
  }
  return 'bg-muted text-muted-foreground'
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function formatAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function AdminAuditPage() {
  const { data: session } = useSession()

  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(true)

  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const pageSize = 25

  // Load orgs
  useEffect(() => {
    setLoadingOrgs(true)
    api
      .get<{ organizations: OrgOption[] }>('/v1/platform/orgs', { params: { page: 1, limit: 200 } })
      .then(({ data }) => {
        const list = data.organizations ?? []
        setOrgs(list)
        if (list.length > 0) setSelectedOrgId(list[0].id)
      })
      .catch(() => adminToast.error('Failed to load organizations.'))
      .finally(() => setLoadingOrgs(false))
  }, [])

  // Load audit logs — uses org-scoped admin endpoint
  // Platform admin can impersonate org context
  const loadLogs = useCallback(async () => {
    if (!selectedOrgId) return
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(pageSize),
      }
      if (search) params.action = search
      if (dateFrom) params.from = new Date(dateFrom + 'T00:00:00').toISOString()
      if (dateTo) params.to = new Date(dateTo + 'T23:59:59.999').toISOString()

      const { data } = await api.get<{ logs: AuditEntry[]; total: number }>('/v1/admin/audit-log', {
        params,
        headers: { 'x-org-id': selectedOrgId },
      })
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [selectedOrgId, page, search, dateFrom, dateTo])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner ring-1 ring-primary/20">
          <ScrollText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Audit Log</h2>
          <p className="text-sm text-muted-foreground">
            Track all administrative actions across organizations
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm">
        {/* Org selector */}
        <div className="min-w-[200px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Organization</label>
          <select
            value={selectedOrgId}
            onChange={(e) => {
              setSelectedOrgId(e.target.value)
              setPage(1)
            }}
            disabled={loadingOrgs}
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.slug})
              </option>
            ))}
          </select>
        </div>

        {/* Action search */}
        <div className="min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Action</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="e.g. user.updated"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        {/* Date range */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>

        {(search || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">{total} entries</span>
      </div>

      {/* Log timeline */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <ScrollText className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No audit entries found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting the filters or selecting a different organization
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-colors hover:bg-muted/20"
            >
              {/* Actor avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {log.actor?.name ? (
                  log.actor.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {log.actor?.name ?? 'System'}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      actionColor(log.action)
                    )}
                  >
                    {formatAction(log.action)}
                  </span>
                  {log.target_type && (
                    <span className="text-xs text-muted-foreground">on {log.target_type}</span>
                  )}
                </div>
                {log.actor?.email && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{log.actor.email}</p>
                )}
                {log.meta && Object.keys(log.meta).length > 0 && (
                  <div className="mt-1.5 rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                    {Object.entries(log.meta)
                      .slice(0, 4)
                      .map(([k, v]) => (
                        <span key={k} className="mr-3">
                          <span className="text-foreground/70">{k}:</span>{' '}
                          {typeof v === 'string' ? v : JSON.stringify(v)}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeTime(log.created_at)}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
