'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Clock, TrendingUp, User, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface UserRow {
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
    { title: 'Total Hours', value: totalHours.toFixed(1), icon: Clock },
    { title: 'Avg Productivity Score', value: `${avgScore.toFixed(0)}%`, icon: TrendingUp },
    { title: 'Most Productive User', value: topUser?.user_name ?? '—', icon: User },
    { title: 'Total Users', value: String(users.length), icon: Users },
  ]

  const chartData = users.map((u) => ({
    name: u.user_name,
    Productive: +(u.productive_sec / 3600).toFixed(1),
    Neutral: +(u.neutral_sec / 3600).toFixed(1),
    Unproductive: +(u.unproductive_sec / 3600).toFixed(1),
  }))

  const columns: Column<UserRow>[] = [
    { key: 'user_name', header: 'User' },
    {
      key: 'total_sec',
      header: 'Total Hours',
      render: (v) => (Number(v) / 3600).toFixed(1),
    },
    {
      key: 'productive_sec',
      header: 'Productive %',
      render: (v, row) =>
        row.total_sec > 0 ? `${((row.productive_sec / row.total_sec) * 100).toFixed(1)}%` : '0%',
    },
    {
      key: 'neutral_sec',
      header: 'Neutral %',
      render: (v, row) =>
        row.total_sec > 0 ? `${((row.neutral_sec / row.total_sec) * 100).toFixed(1)}%` : '0%',
    },
    {
      key: 'unproductive_sec',
      header: 'Unproductive %',
      render: (v, row) =>
        row.total_sec > 0 ? `${((row.unproductive_sec / row.total_sec) * 100).toFixed(1)}%` : '0%',
    },
    {
      key: 'productivity_score',
      header: 'Score',
      render: (v) => `${Number(v).toFixed(0)}%`,
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
