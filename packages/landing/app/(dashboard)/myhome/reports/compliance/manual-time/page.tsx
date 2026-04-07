'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, Percent, List, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface UserSummary extends Record<string, unknown> {
  user_id: string
  user_name: string
  manual_hours: number
  total_hours: number
  manual_ratio: number
}

interface ResponseData {
  entries: unknown[]
  user_summary: UserSummary[]
}

export default function ManualTimePage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/compliance/manual-time', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const summary = data?.user_summary ?? []
  const totalManual = summary.reduce((s, u) => s + u.manual_hours, 0)
  const avgRatio = summary.length
    ? summary.reduce((s, u) => s + u.manual_ratio, 0) / summary.length
    : 0
  const entriesCount = data?.entries?.length ?? 0

  const cards = [
    {
      label: 'Total Manual Hours',
      value: totalManual.toFixed(1),
      icon: Clock,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Manual Ratio',
      value: `${avgRatio.toFixed(1)}%`,
      icon: Percent,
      accent: 'border-l-orange-500',
      iconColor: 'text-orange-500',
    },
    {
      label: 'Entries Count',
      value: entriesCount.toLocaleString(),
      icon: List,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Users With Manual Time',
      value: summary.length.toString(),
      icon: Users,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
  ]

  const columns: Column<UserSummary>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'manual_hours',
      label: 'Manual Hours',
      render: (row) => row.manual_hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.manual_hours,
      align: 'right',
    },
    {
      key: 'total_hours',
      label: 'Total Hours',
      render: (row) => row.total_hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_hours,
      align: 'right',
    },
    {
      key: 'manual_ratio',
      label: 'Manual Ratio %',
      render: (row) => `${row.manual_ratio.toFixed(1)}%`,
      sortable: true,
      sortValue: (row) => row.manual_ratio,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manual Time</h1>
        <p className="text-muted-foreground">
          Track manually entered time across your organization.
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      {summary.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-semibold">Manual Ratio by User</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary}>
              <XAxis dataKey="user_name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="manual_ratio" fill="#f59e0b" name="Manual Ratio %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable columns={columns} data={summary} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="manual-time"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
