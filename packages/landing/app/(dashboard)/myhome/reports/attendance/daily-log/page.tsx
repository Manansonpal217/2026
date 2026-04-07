'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, Users, Star, Layers } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface DailyLogEntry {
  user_id: string
  user_name: string
  date: string
  first_start: string
  last_end: string
  total_sec: number
  session_count: number
}

export default function DailyLogReportPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [entries, setEntries] = useState<DailyLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/attendance/daily-log', { params })
      .then((r) => setEntries(r.data.data.entries))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const totalDays = new Set(entries.map((e) => e.date)).size
  const avgHours = entries.length
    ? (entries.reduce((s, e) => s + e.total_sec, 0) / entries.length / 3600).toFixed(1)
    : '0'
  const userTotals = entries.reduce<Record<string, { name: string; sec: number }>>((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = { name: e.user_name, sec: 0 }
    acc[e.user_id].sec += e.total_sec
    return acc
  }, {})
  const mostActive = Object.values(userTotals).sort((a, b) => b.sec - a.sec)[0]?.name ?? '-'
  const totalSessions = entries.reduce((s, e) => s + e.session_count, 0)

  const cards = [
    { title: 'Total Days Logged', value: totalDays, icon: Clock },
    { title: 'Avg Hours/Day', value: avgHours, icon: Layers },
    { title: 'Most Active User', value: mostActive, icon: Star },
    { title: 'Total Sessions', value: totalSessions, icon: Users },
  ]

  const chartData = Object.entries(
    entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.date] = (acc[e.date] ?? 0) + e.total_sec / 3600
      return acc
    }, {})
  )
    .map(([date, hours]) => ({ date, hours: +hours.toFixed(1) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const columns: Column<DailyLogEntry>[] = [
    { key: 'user_name', label: 'User' },
    { key: 'date', label: 'Date' },
    { key: 'first_start', label: 'First Start' },
    { key: 'last_end', label: 'Last End' },
    { key: 'total_sec', label: 'Hours', render: (v) => (v.total_sec / 3600).toFixed(1) },
    { key: 'session_count', label: 'Sessions' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Daily Log</h1>
        <p className="text-sm text-muted-foreground">
          Daily attendance log with session times and durations
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Daily Hours</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ReportTable columns={columns} data={entries} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="attendance-daily-log"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
