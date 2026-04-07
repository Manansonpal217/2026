'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, Users, TrendingUp, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface OvertimeEntry extends Record<string, unknown> {
  row_key: string
  user_id: string
  user_name: string
  date: string
  total_sec: number
  scheduled_sec: number
  overtime_sec: number
}

export default function OvertimeReportPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [entries, setEntries] = useState<OvertimeEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/attendance/overtime', { params })
      .then((r) => {
        const raw = r.data.data.entries as Array<Omit<OvertimeEntry, 'row_key'>>
        setEntries(
          raw.map((e) => ({
            ...e,
            row_key: `${e.user_id}-${e.date}`,
          })) as OvertimeEntry[]
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const totalOvertimeHrs = (entries.reduce((s, e) => s + e.overtime_sec, 0) / 3600).toFixed(1)
  const avgOvertime = entries.length
    ? (entries.reduce((s, e) => s + e.overtime_sec, 0) / entries.length / 3600).toFixed(1)
    : '0'
  const usersWithOT = new Set(entries.filter((e) => e.overtime_sec > 0).map((e) => e.user_id)).size
  const peakDay = entries.length
    ? entries.reduce((max, e) => (e.overtime_sec > max.overtime_sec ? e : max), entries[0]).date
    : '-'

  const cards = [
    {
      label: 'Total Overtime Hours',
      value: totalOvertimeHrs,
      icon: Clock,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Avg Overtime/Day',
      value: avgOvertime,
      icon: TrendingUp,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Users With Overtime',
      value: String(usersWithOT),
      icon: Users,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Peak Overtime Day',
      value: peakDay,
      icon: Calendar,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const chartData = Object.values(
    entries.reduce<Record<string, { user: string; hours: number }>>((acc, e) => {
      if (!acc[e.user_id]) acc[e.user_id] = { user: e.user_name, hours: 0 }
      acc[e.user_id].hours += e.overtime_sec / 3600
      return acc
    }, {})
  ).map((d) => ({ ...d, hours: +d.hours.toFixed(1) }))

  const columns: Column<OvertimeEntry>[] = [
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
      key: 'scheduled_sec',
      label: 'Scheduled Hours',
      render: (row) => (row.scheduled_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.scheduled_sec,
      align: 'right',
    },
    {
      key: 'total_sec',
      label: 'Actual Hours',
      render: (row) => (row.total_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_sec,
      align: 'right',
    },
    {
      key: 'overtime_sec',
      label: 'Overtime Hours',
      render: (row) => (row.overtime_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.overtime_sec,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overtime</h1>
        <p className="text-sm text-muted-foreground">
          Track overtime hours beyond scheduled work time
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Overtime Hours by User</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="user" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ReportTable columns={columns} data={entries} loading={loading} keyField="row_key" />
      <ExportBar
        reportType="attendance-overtime"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
