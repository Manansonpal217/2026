'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Download, Loader2, Filter } from 'lucide-react'
import { TimeBarChart } from '@/components/reports/TimeBarChart'
import { Button } from '@/components/ui/button'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface TimeDataPoint {
  label: string
  seconds: number
  sessions: number
}

interface Session {
  id: string
  user: { name: string; email: string }
  project?: { name: string } | null
  task?: { name: string } | null
  started_at: string
  ended_at: string
  duration_sec: number
  approval_status: string
}

function secToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ReportsPage() {
  const { data: session } = useSession()
  const [breakdown, setBreakdown] = useState<TimeDataPoint[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'day' | 'project' | 'user'>('day')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
  const [exporting, setExporting] = useState(false)

  const token = (session as { access_token?: string })?.access_token

  useEffect(() => {
    async function fetchReport() {
      if (!token) return
      setLoading(true)
      try {
        const params = new URLSearchParams({
          from: `${from}T00:00:00.000Z`,
          to: `${to}T23:59:59.000Z`,
          group_by: groupBy,
          limit: '200',
        })
        const res = await fetch(`${API_URL}/v1/reports/time?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setBreakdown(data.breakdown)
          setSessions(data.sessions)
          setTotalSeconds(data.total_seconds)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [token, from, to, groupBy])

  async function exportCsv() {
    if (!token) return
    setExporting(true)
    try {
      const params = new URLSearchParams({
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.000Z`,
        format: 'csv',
      })
      const res = await fetch(`${API_URL}/v1/reports/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `report-${from}-${to}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? '…' : `${secToHms(totalSeconds)} tracked in selected period`}
          </p>
        </div>
        <Button size="sm" onClick={exportCsv} disabled={exporting} variant="ghost">
          {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border/50 bg-surface/50">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-surface border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-surface border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Group by</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'day' | 'project' | 'user')}
            className="bg-surface border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="day">Day</option>
            <option value="project">Project</option>
            <option value="user">User</option>
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 rounded-xl border border-border/50 bg-surface/50">
        <h2 className="text-sm font-semibold mb-4">Time Tracked</h2>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TimeBarChart data={breakdown} />
        )}
      </div>

      {/* Sessions table */}
      {groupBy === 'day' && sessions.length > 0 && (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/30">
            <h2 className="text-sm font-semibold">Sessions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  {['Employee', 'Project', 'Date', 'Duration', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 100).map((s) => (
                  <tr key={s.id} className="border-b border-border/20 hover:bg-white/3">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.user.name}</p>
                      <p className="text-xs text-muted-foreground">{s.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.project?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(s.started_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{secToHms(s.duration_sec)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        s.approval_status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        s.approval_status === 'rejected' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                        'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}>
                        {s.approval_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
