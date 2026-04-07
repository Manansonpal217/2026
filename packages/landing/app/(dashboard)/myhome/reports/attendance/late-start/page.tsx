'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, AlertTriangle, Users, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface LateStartEntry extends Record<string, unknown> {
  row_key: string
  user_id: string
  user_name: string
  date: string
  scheduled_start: string
  actual_start: string
  late_minutes: number
}

export default function LateStartReportPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [entries, setEntries] = useState<LateStartEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/attendance/late-start', { params })
      .then((r) => {
        const raw = r.data.data.entries as Array<Omit<LateStartEntry, 'row_key'>>
        setEntries(
          raw.map((e) => ({
            ...e,
            row_key: `${e.user_id}-${e.date}`,
          })) as LateStartEntry[]
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const totalLate = entries.length
  const avgMinutes = entries.length
    ? (entries.reduce((s, e) => s + e.late_minutes, 0) / entries.length).toFixed(0)
    : '0'
  const userLates = entries.reduce<Record<string, { name: string; count: number }>>((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = { name: e.user_name, count: 0 }
    acc[e.user_id].count++
    return acc
  }, {})
  const mostLate = Object.values(userLates).sort((a, b) => b.count - a.count)[0]?.name ?? '-'
  // On-time rate requires knowing total expected days — approximate from unique user-dates
  const onTimeRate = totalLate === 0 ? '100%' : '-'

  const cards = [
    {
      label: 'Total Late Starts',
      value: totalLate,
      icon: AlertTriangle,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Avg Minutes Late',
      value: avgMinutes,
      icon: Clock,
      accent: 'border-l-orange-500',
      iconColor: 'text-orange-500',
    },
    {
      label: 'Most Late User',
      value: mostLate,
      icon: Users,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'On-Time Rate',
      value: onTimeRate,
      icon: Calendar,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
  ]

  const chartData = Object.values(
    entries.reduce<Record<string, { user: string; minutes: number }>>((acc, e) => {
      if (!acc[e.user_id]) acc[e.user_id] = { user: e.user_name, minutes: 0 }
      acc[e.user_id].minutes += e.late_minutes
      return acc
    }, {})
  )

  const columns: Column<LateStartEntry>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'date',
      label: 'Date',
      render: (row) => row.date,
      sortable: true,
      sortValue: (row) => row.date,
    },
    {
      key: 'scheduled_start',
      label: 'Scheduled Start',
      render: (row) => row.scheduled_start,
      sortable: true,
      sortValue: (row) => row.scheduled_start,
    },
    {
      key: 'actual_start',
      label: 'Actual Start',
      render: (row) => row.actual_start,
      sortable: true,
      sortValue: (row) => row.actual_start,
    },
    {
      key: 'late_minutes',
      label: 'Late (min)',
      render: (row) => row.late_minutes,
      sortable: true,
      sortValue: (row) => row.late_minutes,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Late Starts</h1>
        <p className="text-sm text-muted-foreground">
          Track late arrivals against scheduled start times
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Late Minutes by User</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="user" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="minutes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ReportTable columns={columns} data={entries} loading={loading} keyField="row_key" />
      <ExportBar
        reportType="attendance-late-start"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
