'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Clock, TrendingUp, User, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface UserRow extends Record<string, unknown> {
  user_id: string
  user_name: string
  total_sec: number
  productive_sec: number
  neutral_sec: number
  unproductive_sec: number
  productivity_score: number
}

interface SummaryData {
  users: UserRow[]
}

export default function ProductivitySummaryPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/productivity/summary', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const users = data?.users ?? []

  const totalHours = users.reduce((s, u) => s + u.total_sec, 0) / 3600
  const avgScore =
    users.length > 0 ? users.reduce((s, u) => s + u.productivity_score, 0) / users.length : 0
  const topUser =
    users.length > 0
      ? users.reduce((best, u) => (u.productivity_score > best.productivity_score ? u : best))
      : null

  const cards = [
    {
      label: 'Total Hours',
      value: totalHours.toFixed(1),
      icon: Clock,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Avg Productivity Score',
      value: `${avgScore.toFixed(0)}%`,
      icon: TrendingUp,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Most Productive User',
      value: topUser?.user_name ?? '—',
      icon: User,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Total Users',
      value: String(users.length),
      icon: Users,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const chartData = users.map((u) => ({
    name: u.user_name,
    Productive: +(u.productive_sec / 3600).toFixed(1),
    Neutral: +(u.neutral_sec / 3600).toFixed(1),
    Unproductive: +(u.unproductive_sec / 3600).toFixed(1),
  }))

  const columns: Column<UserRow>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'total_sec',
      label: 'Total Hours',
      render: (row) => (row.total_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_sec,
      align: 'right',
    },
    {
      key: 'productive_sec',
      label: 'Productive %',
      render: (row) =>
        row.total_sec > 0 ? `${((row.productive_sec / row.total_sec) * 100).toFixed(1)}%` : '0%',
      sortable: true,
      sortValue: (row) => (row.total_sec > 0 ? (row.productive_sec / row.total_sec) * 100 : 0),
      align: 'right',
    },
    {
      key: 'neutral_sec',
      label: 'Neutral %',
      render: (row) =>
        row.total_sec > 0 ? `${((row.neutral_sec / row.total_sec) * 100).toFixed(1)}%` : '0%',
      sortable: true,
      sortValue: (row) => (row.total_sec > 0 ? (row.neutral_sec / row.total_sec) * 100 : 0),
      align: 'right',
    },
    {
      key: 'unproductive_sec',
      label: 'Unproductive %',
      render: (row) =>
        row.total_sec > 0 ? `${((row.unproductive_sec / row.total_sec) * 100).toFixed(1)}%` : '0%',
      sortable: true,
      sortValue: (row) => (row.total_sec > 0 ? (row.unproductive_sec / row.total_sec) * 100 : 0),
      align: 'right',
    },
    {
      key: 'productivity_score',
      label: 'Score',
      render: (row) => `${row.productivity_score.toFixed(0)}%`,
      sortable: true,
      sortValue: (row) => row.productivity_score,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Productivity Summary</h1>
        <p className="text-sm text-muted-foreground">
          Overview of productive, neutral, and unproductive time across your team.
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Time Breakdown by User</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Productive" stackId="a" fill="#22c55e" />
              <Bar dataKey="Neutral" stackId="a" fill="#eab308" />
              <Bar dataKey="Unproductive" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={users} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="productivity-summary"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
