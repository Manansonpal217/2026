'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FolderOpen, Clock, Target, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface ProjectRow extends Record<string, unknown> {
  project_id: string
  project_name: string
  budget_hours: number
  actual_hours: number
  variance: number
  variance_pct: number
}

export default function BudgetVsActualsPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.projectIds.length) params.project_ids = filters.projectIds.join(',')
    api
      .get('/v1/reports/projects/budget-vs-actuals', { params })
      .then((r) => setData(r.data.data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const totalBudget = data.reduce((s, p) => s + p.budget_hours, 0)
  const totalActual = data.reduce((s, p) => s + p.actual_hours, 0)
  const overBudgetCount = data.filter((p) => p.variance > 0).length
  const avgVariance =
    data.length > 0 ? data.reduce((s, p) => s + p.variance_pct, 0) / data.length : 0

  const cards = [
    {
      label: 'Total Budget Hours',
      value: totalBudget.toFixed(1),
      icon: Target,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Total Actual Hours',
      value: totalActual.toFixed(1),
      icon: Clock,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Over Budget Count',
      value: String(overBudgetCount),
      icon: FolderOpen,
      accent: 'border-l-red-500',
      iconColor: 'text-red-500',
    },
    {
      label: 'Avg Variance %',
      value: `${avgVariance.toFixed(1)}%`,
      icon: Users,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const chartData = data.map((p) => ({
    name: p.project_name,
    Budget: +p.budget_hours.toFixed(1),
    Actual: +p.actual_hours.toFixed(1),
  }))

  const columns: Column<ProjectRow>[] = [
    {
      key: 'project_name',
      label: 'Project',
      render: (row) => row.project_name,
      sortable: true,
      sortValue: (row) => row.project_name,
    },
    {
      key: 'budget_hours',
      label: 'Budget Hours',
      render: (row) => row.budget_hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.budget_hours,
      align: 'right',
    },
    {
      key: 'actual_hours',
      label: 'Actual Hours',
      render: (row) => row.actual_hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.actual_hours,
      align: 'right',
    },
    {
      key: 'variance',
      label: 'Variance',
      render: (row) => row.variance.toFixed(1),
      sortable: true,
      sortValue: (row) => row.variance,
      align: 'right',
    },
    {
      key: 'variance_pct',
      label: 'Variance %',
      render: (row) => (
        <span className={row.variance_pct > 0 ? 'text-red-500' : 'text-emerald-500'}>
          {row.variance_pct > 0 ? '+' : ''}
          {row.variance_pct.toFixed(1)}%
        </span>
      ),
      sortable: true,
      sortValue: (row) => row.variance_pct,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Budget vs Actuals</h1>
        <p className="text-sm text-muted-foreground">
          Compare budgeted hours against actual time spent per project.
        </p>
      </div>
      <ReportFilters onChange={setFilters} showProjects showUsers={false} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Budget vs Actual per Project</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Budget" fill="#2563eb" />
              <Bar dataKey="Actual" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={data} loading={loading} keyField="project_id" />
      <ExportBar
        reportType="projects-budget-vs-actuals"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
