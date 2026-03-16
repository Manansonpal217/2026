'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Shield, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface AuditLog {
  id: string
  actor: { name: string; email: string }
  action: string
  target_type: string
  target_id: string
  old_value: unknown
  new_value: unknown
  ip_address: string | null
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  'session.approved': 'bg-emerald-500/20 text-emerald-400',
  'session.rejected': 'bg-red-500/20 text-red-400',
  'session.edited': 'bg-amber-500/20 text-amber-400',
  'user.updated': 'bg-indigo-500/20 text-indigo-400',
  'user.suspended': 'bg-red-500/20 text-red-400',
  'setting.changed': 'bg-violet-500/20 text-violet-400',
}

export default function AuditPage() {
  const { data: session } = useSession()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState('')
  const LIMIT = 50

  const token = (session as { access_token?: string })?.access_token

  useEffect(() => {
    async function fetchLogs() {
      if (!token) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
        if (filterAction) params.set('action', filterAction)
        const res = await fetch(`${API_URL}/v1/admin/audit-log?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs)
          setTotal(data.total)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [token, page, filterAction])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-1">{loading ? '…' : `${total} events`}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
          placeholder="Filter by action (e.g. session.approved)"
          className="bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-72"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                {['Time', 'Actor', 'Action', 'Target', 'IP'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                    No audit events found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/20 hover:bg-white/3">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{log.actor.name}</p>
                      <p className="text-xs text-muted-foreground">{log.actor.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] ?? 'bg-white/10 text-muted-foreground'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.target_type}:{log.target_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {log.ip_address ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 rounded border border-border/50 disabled:opacity-40 hover:bg-white/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-1.5 rounded border border-border/50 disabled:opacity-40 hover:bg-white/5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
