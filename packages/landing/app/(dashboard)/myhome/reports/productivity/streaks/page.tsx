'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Flame, TrendingUp, Users, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface StreakRow extends Record<string, unknown> {
  user_id: string
  user_name: string
  current_streak: number
  longest_streak: number
  last_active: string
}

interface StreakData {
  streaks: StreakRow[]
}

export default function StreaksPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<StreakData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/productivity/streaks', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const streaks = data?.streaks ?? []

  const highestCurrent = streaks.length > 0 ? Math.max(...streaks.map((s) => s.current_streak)) : 0
  const avgStreak =
    streaks.length > 0 ? streaks.reduce((s, r) => s + r.current_streak, 0) / streaks.length : 0
  const activeUsers = streaks.filter((s) => s.current_streak > 0).length
  const longestEver = streaks.length > 0 ? Math.max(...streaks.map((s) => s.longest_streak)) : 0

  const cards = [
    {
      label: 'Highest Current Streak',
      value: `${highestCurrent} days`,
      icon: Flame,
      accent: 'border-l-orange-500',
      iconColor: 'text-orange-500',
    },
    {
      label: 'Avg Streak Length',
      value: `${avgStreak.toFixed(1)} days`,
      icon: TrendingUp,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Active Users',
      value: String(activeUsers),
      icon: Users,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Longest Ever',
      value: `${longestEver} days`,
      icon: Trophy,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const chartData = streaks.map((s) => ({
    name: s.user_name,
    Current: s.current_streak,
    Longest: s.longest_streak,
  }))

  const columns: Column<StreakRow>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'current_streak',
      label: 'Current Streak',
      render: (row) => `${row.current_streak} days`,
      sortable: true,
      sortValue: (row) => row.current_streak,
      align: 'right',
    },
    {
      key: 'longest_streak',
      label: 'Longest Streak',
      render: (row) => `${row.longest_streak} days`,
      sortable: true,
      sortValue: (row) => row.longest_streak,
      align: 'right',
    },
    {
      key: 'last_active',
      label: 'Last Active',
      render: (row) =>
        row.last_active ? new Date(String(row.last_active)).toLocaleDateString() : '—',
      sortable: true,
      sortValue: (row) => row.last_active,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Streaks</h1>
        <p className="text-sm text-muted-foreground">
          Track consecutive active days to measure team consistency.
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Current vs Longest Streak</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Current" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Longest" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={streaks} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="productivity-streaks"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
