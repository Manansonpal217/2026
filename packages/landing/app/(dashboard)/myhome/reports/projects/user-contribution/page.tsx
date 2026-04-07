'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FolderOpen, Clock, Users, Target } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface ContributionRow extends Record<string, unknown> {
  user_id: string
  user_name: string
  project_name: string
  total_sec: number
  session_count: number
  pct_of_project: number
}

export default function UserContributionPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<ContributionRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.projectIds.length) params.project_ids = filters.projectIds.join(',')
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/projects/user-contribution', { params })
      .then((r) => setData(r.data.data.contributions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const uniqueUsers = new Set(data.map((c) => c.user_id))
  const totalHours = data.reduce((s, c) => s + c.total_sec, 0) / 3600
  const avgHours = uniqueUsers.size > 0 ? totalHours / uniqueUsers.size : 0
  const topContributor =
    data.length > 0 ? data.reduce((best, c) => (c.total_sec > best.total_sec ? c : best)) : null

  const cards = [
    {
      label: 'Total Contributors',
      value: String(uniqueUsers.size),
      icon: Users,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Total Hours',
      value: totalHours.toFixed(1),
      icon: Clock,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Avg Hours/Person',
      value: avgHours.toFixed(1),
      icon: Target,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Top Contributor',
      value: topContributor?.user_name ?? '—',
      icon: FolderOpen,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  // Aggregate hours per user for the chart
  const userHoursMap = new Map<string, number>()
  data.forEach((c) => {
    userHoursMap.set(c.user_name, (userHoursMap.get(c.user_name) ?? 0) + c.total_sec / 3600)
  })
  const chartData = Array.from(userHoursMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, hours]) => ({ name, Hours: +hours.toFixed(1) }))

  const columns: Column<ContributionRow>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'project_name',
      label: 'Project',
      render: (row) => row.project_name,
      sortable: true,
      sortValue: (row) => row.project_name,
    },
    {
      key: 'total_sec',
      label: 'Hours',
      render: (row) => (row.total_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_sec,
      align: 'right',
    },
    {
      key: 'session_count',
      label: 'Sessions',
      render: (row) => row.session_count,
      sortable: true,
      sortValue: (row) => row.session_count,
      align: 'right',
    },
    {
      key: 'pct_of_project',
      label: '% of Project',
      render: (row) => `${row.pct_of_project.toFixed(1)}%`,
      sortable: true,
      sortValue: (row) => row.pct_of_project,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Contribution</h1>
        <p className="text-sm text-muted-foreground">
          Individual contributions to projects by time and session count.
        </p>
      </div>
      <ReportFilters onChange={setFilters} showProjects showUsers />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Hours per User</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Hours" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={data} loading={loading} keyField="user_id" />
      <ExportBar
        reportType="projects-user-contribution"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
