'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import {
  Clock,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  Calendar,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface TimeSession {
  id: string
  started_at: string
  ended_at: string | null
  duration_sec: number
  is_manual: boolean
  notes: string | null
  approval_status: string
  device_name: string
  user: { id: string; name: string; email: string }
  project: { id: string; name: string; color: string } | null
  task: { id: string; name: string } | null
}

interface SessionsResponse {
  sessions: TimeSession[]
  total: number
  total_seconds: number
  page: number
  limit: number
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string, email: string): string {
  if (name)
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  return email.charAt(0).toUpperCase()
}

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string
  value: string
  icon: typeof Clock
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <TrendingUp className="h-3.5 w-3.5 text-success/60" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SessionRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_140px_100px_80px_80px_48px] gap-4 px-6 py-4 items-center">
      {[120, 100, 80, 60, 60, 24].map((w, i) => (
        <div key={i} className={`skeleton h-3.5 rounded`} style={{ width: w }} />
      ))}
    </div>
  )
}

export default function TimeTrackingPage() {
  const { data: session } = useSession()
  const accessToken = (session as { access_token?: string })?.access_token
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 25

  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [from, setFrom] = useState(weekAgo.toISOString().slice(0, 10))
  const [to, setTo] = useState(today.toISOString().slice(0, 10))

  const { data, isLoading } = useQuery<SessionsResponse>({
    queryKey: ['sessions', page, from, to],
    enabled: !!accessToken,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        from: new Date(from).toISOString(),
        to: new Date(to + 'T23:59:59').toISOString(),
      })
      const res = await fetch(`${API_URL}/v1/sessions?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error('Failed to fetch sessions')
      return res.json()
    },
  })

  const filteredSessions = data?.sessions.filter(
    (s) =>
      !search ||
      s.user.name.toLowerCase().includes(search.toLowerCase()) ||
      s.user.email.toLowerCase().includes(search.toLowerCase()) ||
      s.project?.name.toLowerCase().includes(search.toLowerCase()) ||
      s.notes?.toLowerCase().includes(search.toLowerCase()),
  )

  const totalPages = data ? Math.ceil(data.total / limit) : 0

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Time Tracking</h1>
          <p className="text-sm text-muted-foreground">
            View and manage team time sessions
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        <StatCard
          icon={Clock}
          label="Total tracked"
          value={data ? formatDuration(data.total_seconds) : '—'}
          sub={`${from} – ${to}`}
        />
        <StatCard
          icon={Calendar}
          label="Sessions"
          value={data ? String(data.total) : '—'}
        />
        <StatCard
          icon={Users}
          label="Active members"
          value={data ? String(new Set(data.sessions.map((s) => s.user.id)).size) : '—'}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg per session"
          value={
            data && data.total > 0
              ? formatDuration(Math.round(data.total_seconds / data.total))
              : '—'
          }
        />
      </div>

      {/* Filters + table */}
      <div
        className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-card animate-fade-in-up"
        style={{ animationDelay: '0.1s' }}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border/50">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members, projects..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              className="h-8 rounded-lg border border-border/60 bg-input px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1) }}
              className="h-8 rounded-lg border border-border/60 bg-input px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
          </div>
        </div>

        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[1fr_160px_110px_90px_90px_48px] gap-4 px-6 py-2.5 border-b border-border/30 bg-surface/50">
          {['Member', 'Project / Task', 'Started', 'Duration', 'Status', ''].map((col) => (
            <span key={col} className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              {col}
            </span>
          ))}
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="divide-y divide-border/30">
            {Array.from({ length: 6 }).map((_, i) => <SessionRowSkeleton key={i} />)}
          </div>
        ) : filteredSessions && filteredSessions.length > 0 ? (
          <ul className="divide-y divide-border/30">
            {filteredSessions.map((s, idx) => (
              <li
                key={s.id}
                className={cn(
                  'group grid grid-cols-[1fr_160px_110px_90px_90px_48px] gap-4 px-6 py-4 items-center',
                  'hover:bg-white/[0.02] transition-colors duration-100',
                  'animate-fade-in-up',
                )}
                style={{ animationDelay: `${0.03 * idx}s` }}
              >
                {/* Member */}
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-indigo-500 to-violet-600">
                      {getInitials(s.user.name, s.user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.user.name}</p>
                    {s.notes && (
                      <p className="text-xs text-muted-foreground truncate">{s.notes}</p>
                    )}
                  </div>
                </div>

                {/* Project / Task */}
                <div className="min-w-0">
                  {s.project ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: s.project.color }}
                      />
                      <span className="text-xs text-foreground truncate">{s.project.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No project</span>
                  )}
                  {s.task && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {s.task.name}
                    </p>
                  )}
                </div>

                {/* Started */}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(s.started_at)}
                </p>

                {/* Duration */}
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {s.ended_at ? formatDuration(s.duration_sec) : (
                    <span className="flex items-center gap-1 text-success text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      Live
                    </span>
                  )}
                </p>

                {/* Approval status */}
                <div>
                  <Badge
                    variant={
                      s.approval_status === 'approved'
                        ? 'active'
                        : s.approval_status === 'rejected'
                          ? 'suspended'
                          : 'outline'
                    }
                    dot={s.approval_status === 'approved'}
                  >
                    {s.approval_status}
                  </Badge>
                  {s.is_manual && (
                    <span className="text-[9px] text-muted-foreground/50 block mt-0.5">manual</span>
                  )}
                </div>

                {/* Device */}
                <p className="text-[10px] text-muted-foreground/50 truncate hidden lg:block">
                  {s.device_name}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
              <Clock className="h-7 w-7 text-primary/60" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">No sessions found</p>
              <p className="text-xs text-muted-foreground">
                {search
                  ? `No results for "${search}"`
                  : 'No time sessions in the selected date range'}
              </p>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {data?.total ?? 0} sessions
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
