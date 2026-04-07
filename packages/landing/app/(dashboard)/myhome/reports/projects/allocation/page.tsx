'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FolderOpen, Clock, Users, Target } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface ProjectRow extends Record<string, unknown> {
  project_id: string
  project_name: string
  total_sec: number
  user_count: number
  sessions: number
}

const COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
]

export default function ProjectAllocationPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    if (filters.projectIds.length) params.project_ids = filters.projectIds.join(',')
    api
      .get('/v1/reports/projects/allocation', { params })
      .then((r) => setData(r.data.data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const totalHours = data.reduce((s, p) => s + p.total_sec, 0) / 3600
  const avgHours = data.length > 0 ? totalHours / data.length : 0
  const topProject =
    data.length > 0 ? data.reduce((best, p) => (p.total_sec > best.total_sec ? p : best)) : null

  const cards = [
    {
      label: 'Total Projects',
      value: String(data.length),
      icon: FolderOpen,
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
      label: 'Avg Hours/Project',
      value: avgHours.toFixed(1),
      icon: Target,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Most Time Project',
      value: topProject?.project_name ?? '—',
      icon: Users,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const pieData = data
    .slice()
    .sort((a, b) => b.total_sec - a.total_sec)
    .slice(0, 8)
    .map((p) => ({ name: p.project_name, value: +(p.total_sec / 3600).toFixed(1) }))

  const columns: Column<ProjectRow>[] = [
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
      key: 'user_count',
      label: 'Users',
      render: (row) => row.user_count,
      sortable: true,
      sortValue: (row) => row.user_count,
      align: 'right',
    },
    {
      key: 'sessions',
      label: 'Sessions',
      render: (row) => row.sessions,
      sortable: true,
      sortValue: (row) => row.sessions,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Project Allocation</h1>
        <p className="text-sm text-muted-foreground">
          Time distribution across projects for the selected period.
        </p>
      </div>
      <ReportFilters onChange={setFilters} showProjects />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Hours by Project</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
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
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={data} loading={loading} keyField="project_id" />
      <ExportBar
        reportType="projects-allocation"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
