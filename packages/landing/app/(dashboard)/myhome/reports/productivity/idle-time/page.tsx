'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, Users, Timer, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface IdleRow extends Record<string, unknown> {
  user_id: string
  user_name: string
  total_idle_sec: number
  idle_sessions: number
  avg_idle_sec: number
  longest_idle_sec: number
}

interface IdleData {
  users: IdleRow[]
}

export default function IdleTimePage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<IdleData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/productivity/idle-time', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const users = data?.users ?? []

  const totalIdleHours = users.reduce((s, u) => s + u.total_idle_sec, 0) / 3600
  const avgIdlePerUser = users.length > 0 ? totalIdleHours / users.length : 0
  const longestIdle = users.length > 0 ? Math.max(...users.map((u) => u.longest_idle_sec)) : 0
  const usersWithIdle = users.filter((u) => u.total_idle_sec > 0).length

  const cards = [
    {
      label: 'Total Idle Hours',
      value: totalIdleHours.toFixed(1),
      icon: Clock,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Avg Idle Per User',
      value: `${avgIdlePerUser.toFixed(1)}h`,
      icon: Timer,
      accent: 'border-l-orange-500',
      iconColor: 'text-orange-500',
    },
    {
      label: 'Longest Idle Session',
      value: `${(longestIdle / 60).toFixed(0)} min`,
      icon: AlertTriangle,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'Users With Idle',
      value: String(usersWithIdle),
      icon: Users,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
  ]

  const chartData = users.map((u) => ({
    name: u.user_name,
    hours: +(u.total_idle_sec / 3600).toFixed(2),
  }))

  const columns: Column<IdleRow>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'total_idle_sec',
      label: 'Total Idle Hours',
      render: (row) => (row.total_idle_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_idle_sec,
      align: 'right',
    },
    {
      key: 'idle_sessions',
      label: 'Idle Sessions',
      render: (row) => row.idle_sessions,
      sortable: true,
      sortValue: (row) => row.idle_sessions,
      align: 'right',
    },
    {
      key: 'avg_idle_sec',
      label: 'Avg Idle (min)',
      render: (row) => (row.avg_idle_sec / 60).toFixed(1),
      sortable: true,
      sortValue: (row) => row.avg_idle_sec,
      align: 'right',
    },
    {
      key: 'longest_idle_sec',
      label: 'Longest Idle (min)',
      render: (row) => (row.longest_idle_sec / 60).toFixed(1),
      sortable: true,
      sortValue: (row) => row.longest_idle_sec,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Idle Time</h1>
        <p className="text-sm text-muted-foreground">
          Track idle periods across your team to identify engagement gaps.
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Idle Hours by User</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="hours" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={users} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="productivity-idle-time"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
