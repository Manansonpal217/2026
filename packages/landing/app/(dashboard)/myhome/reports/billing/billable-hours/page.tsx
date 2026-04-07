'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, FolderOpen, Users, Edit } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface BillableRow extends Record<string, unknown> {
  row_key: string
  project_name: string
  user_name: string
  date: string
  hours: number
  is_manual: boolean
  approval_status: string
}

export default function BillableHoursPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<BillableRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    if (filters.projectIds?.length) params.project_ids = filters.projectIds.join(',')
    api
      .get('/v1/reports/billing/billable-hours', { params })
      .then((r) => {
        const rows = r.data.data as Array<Omit<BillableRow, 'row_key'>>
        setData(
          rows.map((row, i) => ({
            ...row,
            row_key: `${row.project_name}|${row.user_name}|${row.date}|${i}`,
          })) as BillableRow[]
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const totalHours = data.reduce((s, r) => s + r.hours, 0)
  const uniqueProjects = new Set(data.map((r) => r.project_name)).size
  const uniqueUsers = new Set(data.map((r) => r.user_name)).size
  const manualEntries = data.filter((r) => r.is_manual).length

  // Hours per project for chart
  const projectHours = data.reduce<Record<string, number>>((acc, r) => {
    acc[r.project_name] = (acc[r.project_name] ?? 0) + r.hours
    return acc
  }, {})
  const chartData = Object.entries(projectHours).map(([project, hours]) => ({ project, hours }))

  const cards = [
    {
      label: 'Total Billable Hours',
      value: totalHours.toFixed(1),
      icon: Clock,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Unique Projects',
      value: uniqueProjects.toString(),
      icon: FolderOpen,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Unique Users',
      value: uniqueUsers.toString(),
      icon: Users,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Manual Entries',
      value: manualEntries.toString(),
      icon: Edit,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const columns: Column<BillableRow>[] = [
    {
      key: 'project_name',
      label: 'Project',
      render: (row) => row.project_name,
      sortable: true,
      sortValue: (row) => row.project_name,
    },
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
      render: (row) => new Date(String(row.date)).toLocaleDateString(),
      sortable: true,
      sortValue: (row) => row.date,
    },
    {
      key: 'hours',
      label: 'Hours',
      render: (row) => row.hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.hours,
      align: 'right',
    },
    {
      key: 'is_manual',
      label: 'Manual?',
      render: (row) => (row.is_manual ? 'Yes' : 'No'),
      sortable: true,
      sortValue: (row) => (row.is_manual ? 1 : 0),
    },
    {
      key: 'approval_status',
      label: 'Status',
      render: (row) => row.approval_status,
      sortable: true,
      sortValue: (row) => row.approval_status,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billable Hours</h1>
        <p className="text-muted-foreground">Track billable hours by project and user.</p>
      </div>
      <ReportFilters onChange={setFilters} showProjects={true} />
      <ReportStatCards cards={cards} loading={loading} />
      {chartData.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-4 font-semibold">Hours per Project</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="project" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="hours" fill="#10b981" name="Hours" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable columns={columns} data={data} loading={loading} keyField="row_key" />
      <ExportBar
        reportType="billable-hours"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
