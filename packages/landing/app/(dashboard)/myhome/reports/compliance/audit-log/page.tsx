'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Shield, Users, Zap, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface AuditEntry extends Record<string, unknown> {
  id: string
  user_name: string
  action: string
  entity_type: string
  entity_id: string
  created_at: string
  ip_address: string
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<{ entries: AuditEntry[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/compliance/audit-log', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const entries = data?.entries ?? []
  const uniqueUsers = new Set(entries.map((e) => e.user_name)).size
  const uniqueActions = new Set(entries.map((e) => e.action)).size
  const dateRange =
    entries.length > 0
      ? `${new Date(entries[entries.length - 1].created_at).toLocaleDateString()} - ${new Date(entries[0].created_at).toLocaleDateString()}`
      : '-'

  // Group events by day for chart
  const eventsPerDay = entries.reduce<Record<string, number>>((acc, e) => {
    const day = new Date(e.created_at).toLocaleDateString()
    acc[day] = (acc[day] ?? 0) + 1
    return acc
  }, {})
  const chartData = Object.entries(eventsPerDay).map(([date, count]) => ({ date, count }))

  const cards = [
    {
      label: 'Total Events',
      value: entries.length.toLocaleString(),
      icon: Shield,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Unique Users',
      value: uniqueUsers.toString(),
      icon: Users,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Unique Actions',
      value: uniqueActions.toString(),
      icon: Zap,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Date Range',
      value: dateRange,
      icon: Calendar,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
  ]

  const columns: Column<AuditEntry>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'action',
      label: 'Action',
      render: (row) => row.action,
      sortable: true,
      sortValue: (row) => row.action,
    },
    {
      key: 'entity_type',
      label: 'Entity Type',
      render: (row) => row.entity_type,
      sortable: true,
      sortValue: (row) => row.entity_type,
    },
    {
      key: 'entity_id',
      label: 'Entity ID',
      render: (row) => row.entity_id,
      sortable: true,
      sortValue: (row) => row.entity_id,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (row) => new Date(String(row.created_at)).toLocaleString(),
      sortable: true,
      sortValue: (row) => row.created_at,
    },
    {
      key: 'ip_address',
      label: 'IP',
      render: (row) => row.ip_address ?? '—',
      sortable: true,
      sortValue: (row) => row.ip_address ?? '',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Review all audit events across your organization.</p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      {chartData.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-semibold">Events per Day</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" name="Events" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable columns={columns} data={entries} loading={loading} keyField="id" />
      <ExportBar
        reportType="audit-log"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
