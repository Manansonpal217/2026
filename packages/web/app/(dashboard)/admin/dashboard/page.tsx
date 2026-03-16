'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Clock, Camera, CheckSquare, TrendingUp, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { TimeBarChart } from '@/components/reports/TimeBarChart'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface KpiData {
  totalUsersActive: number
  hoursThisWeek: number
  screenshotsToday: number
  pendingApprovals: number
}

interface TimeDataPoint {
  label: string
  seconds: number
  sessions: number
}

function secToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [timeData, setTimeData] = useState<TimeDataPoint[]>([])
  const [loading, setLoading] = useState(true)

  const token = (session as { access_token?: string })?.access_token

  useEffect(() => {
    async function fetchDashboardData() {
      if (!token) return
      setLoading(true)

      const today = new Date()
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - 6)

      try {
        const [usersRes, timeRes, screenshotsRes, approvalsRes] = await Promise.allSettled([
          fetch(`${API_URL}/v1/admin/users?status=active&limit=1`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/v1/reports/time?from=${weekStart.toISOString()}&to=${today.toISOString()}&group_by=day&limit=200`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/v1/screenshots?from=${today.toISOString().split('T')[0]}T00:00:00.000Z&to=${today.toISOString().split('T')[0]}T23:59:59.000Z&limit=1`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/v1/sessions/pending-approval?limit=1`, { headers: { Authorization: `Bearer ${token}` } }),
        ])

        let totalUsersActive = 0
        let hoursThisWeek = 0
        let screenshotsToday = 0
        let pendingApprovals = 0

        if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
          const d = await usersRes.value.json()
          totalUsersActive = d.total ?? 0
        }
        if (timeRes.status === 'fulfilled' && timeRes.value.ok) {
          const d = await timeRes.value.json()
          hoursThisWeek = d.total_seconds ?? 0
          setTimeData(d.breakdown ?? [])
        }
        if (screenshotsRes.status === 'fulfilled' && screenshotsRes.value.ok) {
          const d = await screenshotsRes.value.json()
          screenshotsToday = d.total ?? 0
        }
        if (approvalsRes.status === 'fulfilled' && approvalsRes.value.ok) {
          const d = await approvalsRes.value.json()
          pendingApprovals = d.total ?? 0
        }

        setKpi({ totalUsersActive, hoursThisWeek, screenshotsToday, pendingApprovals })
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardData()
  }, [token])

  const kpiCards = [
    {
      label: 'Active Users',
      value: loading ? '…' : String(kpi?.totalUsersActive ?? 0),
      icon: Users,
      color: 'indigo',
      href: '/admin/team',
    },
    {
      label: 'Hours This Week',
      value: loading ? '…' : secToHms(kpi?.hoursThisWeek ?? 0),
      icon: Clock,
      color: 'violet',
      href: '/admin/reports',
    },
    {
      label: 'Screenshots Today',
      value: loading ? '…' : String(kpi?.screenshotsToday ?? 0),
      icon: Camera,
      color: 'sky',
      href: '/admin/screenshots',
    },
    {
      label: 'Pending Approvals',
      value: loading ? '…' : String(kpi?.pendingApprovals ?? 0),
      icon: CheckSquare,
      color: kpi?.pendingApprovals ? 'amber' : 'emerald',
      href: '/admin/approvals',
    },
  ]

  const colorMap: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', icon: 'text-indigo-400' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', icon: 'text-violet-400' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', icon: 'text-sky-400' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', icon: 'text-amber-400' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: 'text-emerald-400' },
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome back, {session?.user?.name}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color, href }) => {
          const colors = colorMap[color]
          return (
            <Link key={label} href={href} className="block group">
              <div className="p-4 rounded-xl border border-border/50 bg-surface/50 hover:bg-surface/80 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
                    <Icon className={`h-4 w-4 ${colors.icon}`} />
                  </div>
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
                <p className={`text-2xl font-bold ${loading ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Time chart — last 7 days */}
      <div className="p-4 rounded-xl border border-border/50 bg-surface/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Time Tracked — Last 7 Days</h2>
          <Link href="/admin/reports" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TimeBarChart data={timeData} />
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'View Approvals', href: '/admin/approvals', desc: 'Review pending sessions' },
          { label: 'Manage Integrations', href: '/admin/integrations', desc: 'Connect Jira & Asana' },
          { label: 'Audit Log', href: '/admin/audit', desc: 'Track admin actions' },
        ].map(({ label, href, desc }) => (
          <Link
            key={href}
            href={href}
            className="p-4 rounded-xl border border-border/50 bg-surface/50 hover:bg-surface/80 transition-colors group"
          >
            <p className="text-sm font-medium group-hover:text-primary transition-colors">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
