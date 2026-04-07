'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, AlertTriangle, Users, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface LateStartEntry {
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
      .then((r) => setEntries(r.data.data.entries))
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
    { title: 'Total Late Starts', value: totalLate, icon: AlertTriangle },
    { title: 'Avg Minutes Late', value: avgMinutes, icon: Clock },
    { title: 'Most Late User', value: mostLate, icon: Users },
    { title: 'On-Time Rate', value: onTimeRate, icon: Calendar },
  ]

  const chartData = Object.values(
    entries.reduce<Record<string, { user: string; minutes: number }>>((acc, e) => {
      if (!acc[e.user_id]) acc[e.user_id] = { user: e.user_name, minutes: 0 }
      acc[e.user_id].minutes += e.late_minutes
      return acc
    }, {})
  )

  const columns: Column<LateStartEntry>[] = [
    { key: 'user_name', label: 'User' },
    { key: 'date', label: 'Date' },
    { key: 'scheduled_start', label: 'Scheduled Start' },
    { key: 'actual_start', label: 'Actual Start' },
    { key: 'late_minutes', label: 'Late (min)' },
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
      <ReportTable columns={columns} data={entries} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="attendance-late-start"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
