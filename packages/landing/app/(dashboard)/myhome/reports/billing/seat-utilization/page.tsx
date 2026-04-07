'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, UserCheck, UserX, Percent } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface InactiveUser extends Record<string, unknown> {
  id: string
  name: string
  email: string
  last_active: string
}

interface SeatData {
  total_seats: number
  active_seats: number
  inactive_seats: number
  utilization_rate: number
  inactive_users: InactiveUser[]
}

const PIE_COLORS = ['#10b981', '#ef4444']

export default function SeatUtilizationPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<SeatData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    api
      .get('/v1/reports/billing/seat-utilization', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const cards = [
    {
      label: 'Total Seats',
      value: data?.total_seats?.toString() ?? '-',
      icon: Users,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Active',
      value: data?.active_seats?.toString() ?? '-',
      icon: UserCheck,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Inactive',
      value: data?.inactive_seats?.toString() ?? '-',
      icon: UserX,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'Utilization Rate',
      value: data ? `${data.utilization_rate.toFixed(1)}%` : '-',
      icon: Percent,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
  ]

  const pieData = data
    ? [
        { name: 'Active', value: data.active_seats },
        { name: 'Inactive', value: data.inactive_seats },
      ]
    : []

  const columns: Column<InactiveUser>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => row.name,
      sortable: true,
      sortValue: (row) => row.name,
    },
    {
      key: 'email',
      label: 'Email',
      render: (row) => row.email,
      sortable: true,
      sortValue: (row) => row.email,
    },
    {
      key: 'last_active',
      label: 'Last Active',
      render: (row) =>
        row.last_active ? new Date(String(row.last_active)).toLocaleDateString() : 'Never',
      sortable: true,
      sortValue: (row) => row.last_active,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seat Utilization</h1>
        <p className="text-muted-foreground">
          Monitor active vs inactive seats in your organization.
        </p>
      </div>
      <ReportFilters onChange={setFilters} showUsers={false} />
      <ReportStatCards cards={cards} loading={loading} />
      {pieData.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-semibold">Active vs Inactive Seats</h3>
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
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable
        columns={columns}
        data={data?.inactive_users ?? []}
        loading={loading}
        keyField="id"
      />
      <ExportBar
        reportType="seat-utilization"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
