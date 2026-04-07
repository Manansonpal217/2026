'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Shield, Camera, EyeOff, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface UserRow extends Record<string, unknown> {
  user_id: string
  user_name: string
  total_screenshots: number
  blurred_count: number
  deleted_count: number
  compliance_rate: number
}

export default function ScreenshotAuditPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<{ users: UserRow[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/compliance/screenshot-audit', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const users = data?.users ?? []
  const totalScreenshots = users.reduce((s, u) => s + u.total_screenshots, 0)
  const totalBlurred = users.reduce((s, u) => s + u.blurred_count, 0)
  const totalDeleted = users.reduce((s, u) => s + u.deleted_count, 0)
  const avgCompliance = users.length
    ? users.reduce((s, u) => s + u.compliance_rate, 0) / users.length
    : 0

  const cards = [
    {
      label: 'Total Screenshots',
      value: totalScreenshots.toLocaleString(),
      icon: Camera,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Blurred',
      value: totalBlurred.toLocaleString(),
      icon: EyeOff,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Deleted',
      value: totalDeleted.toLocaleString(),
      icon: Trash2,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'Avg Compliance Rate',
      value: `${avgCompliance.toFixed(1)}%`,
      icon: Shield,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
  ]

  const columns: Column<UserRow>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'total_screenshots',
      label: 'Total',
      render: (row) => row.total_screenshots,
      sortable: true,
      sortValue: (row) => row.total_screenshots,
      align: 'right',
    },
    {
      key: 'blurred_count',
      label: 'Blurred',
      render: (row) => row.blurred_count,
      sortable: true,
      sortValue: (row) => row.blurred_count,
      align: 'right',
    },
    {
      key: 'deleted_count',
      label: 'Deleted',
      render: (row) => row.deleted_count,
      sortable: true,
      sortValue: (row) => row.deleted_count,
      align: 'right',
    },
    {
      key: 'compliance_rate',
      label: 'Compliance Rate %',
      render: (row) => `${row.compliance_rate.toFixed(1)}%`,
      sortable: true,
      sortValue: (row) => row.compliance_rate,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Screenshot Audit</h1>
        <p className="text-muted-foreground">Review screenshot compliance across your team.</p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      {users.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-semibold">Compliance Rate by User</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={users}>
              <XAxis dataKey="user_name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="compliance_rate" fill="#3b82f6" name="Compliance %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable columns={columns} data={users} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="screenshot-audit"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
