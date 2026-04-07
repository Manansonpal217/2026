'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Calendar, Users, TrendingDown, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface AbsenteeismUser extends Record<string, unknown> {
  user_id: string
  user_name: string
  total_working_days: number
  days_present: number
  days_absent: number
  absence_rate: number
}

export default function AbsenteeismReportPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [users, setUsers] = useState<AbsenteeismUser[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/attendance/absenteeism', { params })
      .then((r) => setUsers(r.data.data.users))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const avgRate = users.length
    ? (users.reduce((s, u) => s + u.absence_rate, 0) / users.length).toFixed(1) + '%'
    : '0%'
  const perfectAttendance = users.filter((u) => u.days_absent === 0).length
  const highestRate = users.length
    ? users
        .reduce((max, u) => (u.absence_rate > max.absence_rate ? u : max), users[0])
        .absence_rate.toFixed(1) + '%'
    : '0%'
  const totalAbsent = users.reduce((s, u) => s + u.days_absent, 0)

  const cards = [
    {
      label: 'Avg Absence Rate',
      value: avgRate,
      icon: TrendingDown,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'Users 100% Present',
      value: perfectAttendance,
      icon: Users,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Highest Absence Rate',
      value: highestRate,
      icon: AlertTriangle,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    {
      label: 'Total Absent Days',
      value: totalAbsent,
      icon: Calendar,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
  ]

  const chartData = users.map((u) => ({
    user: u.user_name,
    rate: +u.absence_rate.toFixed(1),
  }))

  const columns: Column<AbsenteeismUser>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'total_working_days',
      label: 'Working Days',
      render: (row) => row.total_working_days,
      sortable: true,
      sortValue: (row) => row.total_working_days,
      align: 'right',
    },
    {
      key: 'days_present',
      label: 'Present',
      render: (row) => row.days_present,
      sortable: true,
      sortValue: (row) => row.days_present,
      align: 'right',
    },
    {
      key: 'days_absent',
      label: 'Absent',
      render: (row) => row.days_absent,
      sortable: true,
      sortValue: (row) => row.days_absent,
      align: 'right',
    },
    {
      key: 'absence_rate',
      label: 'Absence Rate %',
      render: (row) => row.absence_rate.toFixed(1) + '%',
      sortable: true,
      sortValue: (row) => row.absence_rate,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Absenteeism</h1>
        <p className="text-sm text-muted-foreground">
          Absence rates and attendance patterns across team members
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Absence Rate by User</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="user" fontSize={12} />
            <YAxis fontSize={12} unit="%" />
            <Tooltip />
            <Bar dataKey="rate" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ReportTable columns={columns} data={users} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="attendance-absenteeism"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
