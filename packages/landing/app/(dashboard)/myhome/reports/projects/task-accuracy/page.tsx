'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FolderOpen, Clock, Target, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface TaskRow extends Record<string, unknown> {
  task_key: string
  task_summary: string
  estimated_sec: number
  actual_sec: number
  accuracy_pct: number
}

export default function TaskAccuracyPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.projectIds.length) params.project_ids = filters.projectIds.join(',')
    api
      .get('/v1/reports/projects/task-accuracy', { params })
      .then((r) => setData(r.data.data.tasks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const avgAccuracy =
    data.length > 0 ? data.reduce((s, t) => s + t.accuracy_pct, 0) / data.length : 0
  const overEstimated = data.filter((t) => t.accuracy_pct > 100).length
  const underEstimated = data.filter((t) => t.accuracy_pct < 100).length

  const cards = [
    {
      label: 'Total Tasks',
      value: String(data.length),
      icon: FolderOpen,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Avg Accuracy %',
      value: `${avgAccuracy.toFixed(0)}%`,
      icon: Target,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Over-estimated',
      value: String(overEstimated),
      icon: Clock,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Under-estimated',
      value: String(underEstimated),
      icon: Users,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const chartData = data
    .slice()
    .sort((a, b) => b.actual_sec - a.actual_sec)
    .slice(0, 15)
    .map((t) => ({
      name: t.task_key,
      Estimated: +(t.estimated_sec / 3600).toFixed(1),
      Actual: +(t.actual_sec / 3600).toFixed(1),
    }))

  const columns: Column<TaskRow>[] = [
    {
      key: 'task_key',
      label: 'Task Key',
      render: (row) => row.task_key,
      sortable: true,
      sortValue: (row) => row.task_key,
    },
    { key: 'task_summary', label: 'Summary', render: (row) => row.task_summary },
    {
      key: 'estimated_sec',
      label: 'Estimated Hours',
      render: (row) => (row.estimated_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.estimated_sec,
      align: 'right',
    },
    {
      key: 'actual_sec',
      label: 'Actual Hours',
      render: (row) => (row.actual_sec / 3600).toFixed(1),
      sortable: true,
      sortValue: (row) => row.actual_sec,
      align: 'right',
    },
    {
      key: 'accuracy_pct',
      label: 'Accuracy %',
      render: (row) => (
        <span
          className={
            row.accuracy_pct >= 90 && row.accuracy_pct <= 110
              ? 'text-emerald-500'
              : 'text-amber-500'
          }
        >
          {row.accuracy_pct.toFixed(0)}%
        </span>
      ),
      sortable: true,
      sortValue: (row) => row.accuracy_pct,
      align: 'right',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Task Accuracy</h1>
        <p className="text-sm text-muted-foreground">
          Compare estimated vs actual time per task to improve future estimates.
        </p>
      </div>
      <ReportFilters onChange={setFilters} showProjects showUsers={false} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Estimated vs Actual per Task (Top 15)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Estimated" fill="#2563eb" />
              <Bar dataKey="Actual" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ReportTable columns={columns} data={data} loading={loading} keyField="task_key" />
      <ExportBar
        reportType="projects-task-accuracy"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
