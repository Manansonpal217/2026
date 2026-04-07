'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Clock, CheckCircle, AlertTriangle, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface OfflineTimeEntry extends Record<string, unknown> {
  row_key: string
  user_id: string
  user_name: string
  reason: string
  requested_start: string
  requested_end: string
  duration_hours: number
  status: 'APPROVED' | 'PENDING' | 'REJECTED'
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: '#22c55e',
  PENDING: '#f59e0b',
  REJECTED: '#ef4444',
}

export default function OfflineTimeReportPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [entries, setEntries] = useState<OfflineTimeEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/attendance/offline-time', { params })
      .then((r) => {
        const raw = r.data.data.entries as Array<Omit<OfflineTimeEntry, 'row_key'>>
        setEntries(
          raw.map((e, i) => ({
            ...e,
            row_key: `${e.user_id}-${e.requested_start}-${i}`,
          })) as OfflineTimeEntry[]
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const total = entries.length
  const approved = entries.filter((e) => e.status === 'APPROVED').length
  const pending = entries.filter((e) => e.status === 'PENDING').length
  const totalHours = entries.reduce((s, e) => s + e.duration_hours, 0).toFixed(1)

  const cards = [
    {
      label: 'Total Requests',
      value: total,
      icon: Calendar,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Approved',
      value: approved,
      icon: CheckCircle,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Pending',
      value: pending,
      icon: AlertTriangle,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Total Hours Off',
      value: totalHours,
      icon: Clock,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
  ]

  const pieData = Object.entries(
    entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  const columns: Column<OfflineTimeEntry>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => row.reason,
      sortable: true,
      sortValue: (row) => row.reason,
    },
    {
      key: 'requested_start',
      label: 'Start',
      render: (row) => row.requested_start,
      sortable: true,
      sortValue: (row) => row.requested_start,
    },
    {
      key: 'requested_end',
      label: 'End',
      render: (row) => row.requested_end,
      sortable: true,
      sortValue: (row) => row.requested_end,
    },
    {
      key: 'duration_hours',
      label: 'Hours',
      render: (row) => row.duration_hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.duration_hours,
      align: 'right',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: STATUS_COLORS[row.status] ?? '#6b7280' }}
        >
          {row.status}
        </span>
      ),
      sortable: true,
      sortValue: (row) => row.status,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Offline Time</h1>
        <p className="text-sm text-muted-foreground">
          Leave and offline time requests with approval status
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Requests by Status</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={STATUS_COLORS[entry.name] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ReportTable columns={columns} data={entries} loading={loading} keyField="row_key" />
      <ExportBar
        reportType="attendance-offline-time"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
