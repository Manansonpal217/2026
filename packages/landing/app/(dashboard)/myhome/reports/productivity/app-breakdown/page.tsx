'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { AppWindow, CheckCircle, XCircle, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface AppRow extends Record<string, unknown> {
  app_name: string
  category: string
  total_sec: number
  session_count: number
  type: 'productive' | 'neutral' | 'unproductive'
}

interface AppData {
  apps: AppRow[]
}

const PIE_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#a855f7',
]

const TYPE_COLORS: Record<string, string> = {
  productive: 'bg-green-100 text-green-700',
  neutral: 'bg-yellow-100 text-yellow-700',
  unproductive: 'bg-red-100 text-red-700',
}

export default function AppBreakdownPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/productivity/app-breakdown', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const apps = data?.apps ?? []

  const productiveCount = apps.filter((a) => a.type === 'productive').length
  const unproductiveCount = apps.filter((a) => a.type === 'unproductive').length
  const topApp =
    apps.length > 0 ? apps.reduce((best, a) => (a.total_sec > best.total_sec ? a : best)) : null

  const cards = [
    {
      label: 'Total Apps',
      value: String(apps.length),
      icon: AppWindow,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Productive Apps',
      value: String(productiveCount),
      icon: CheckCircle,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Unproductive Apps',
      value: String(unproductiveCount),
      icon: XCircle,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'Top App',
      value: topApp?.app_name ?? '—',
      icon: Star,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const pieData = [...apps]
    .sort((a, b) => b.total_sec - a.total_sec)
    .slice(0, 10)
    .map((a) => ({ name: a.app_name, value: +(a.total_sec / 3600).toFixed(2) }))

  const columns: Column<AppRow>[] = [
    {
      key: 'app_name',
      label: 'App Name',
      render: (row) => row.app_name,
      sortable: true,
      sortValue: (row) => row.app_name,
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => row.category,
      sortable: true,
      sortValue: (row) => row.category,
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[row.type] ?? ''}`}
        >
          {row.type}
        </span>
      ),
      sortable: true,
      sortValue: (row) => row.type,
    },
    {
      key: 'total_sec',
      label: 'Hours',
      render: (row) => (row.total_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_sec,
      align: 'right',
    },
    {
      key: 'session_count',
      label: 'Sessions',
      render: (row) => row.session_count,
      sortable: true,
      sortValue: (row) => row.session_count,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">App Breakdown</h1>
        <p className="text-sm text-muted-foreground">
          See which applications your team spends the most time on.
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Top 10 Apps by Time</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={apps} loading={loading} keyField="app_name" />
      <ExportBar
        reportType="productivity-app-breakdown"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
