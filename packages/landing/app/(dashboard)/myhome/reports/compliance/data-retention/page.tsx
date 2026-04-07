'use client'

import { useEffect, useState } from 'react'
import { Camera, Clock, Activity, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ExportBar } from '@/components/reports/ExportBar'

interface RetentionBucket {
  total: number
  oldest: string
  retention_days: number
}

interface RetentionData {
  screenshots: RetentionBucket
  sessions: RetentionBucket
  activity_logs: RetentionBucket
}

export default function DataRetentionPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<RetentionData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    api
      .get('/v1/reports/compliance/data-retention', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const oldest = data
    ? [data.screenshots.oldest, data.sessions.oldest, data.activity_logs.oldest]
        .filter(Boolean)
        .sort()[0]
    : null

  const cards = [
    {
      label: 'Screenshots Count',
      value: data?.screenshots.total.toLocaleString() ?? '-',
      icon: Camera,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Sessions Count',
      value: data?.sessions.total.toLocaleString() ?? '-',
      icon: Clock,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Activity Logs',
      value: data?.activity_logs.total.toLocaleString() ?? '-',
      icon: Activity,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Oldest Record',
      value: oldest ? new Date(oldest).toLocaleDateString() : '-',
      icon: Calendar,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  const buckets = data
    ? [
        { label: 'Screenshots', ...data.screenshots },
        { label: 'Sessions', ...data.sessions },
        { label: 'Activity Logs', ...data.activity_logs },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Retention</h1>
        <p className="text-muted-foreground">
          Overview of data retention across your organization.
        </p>
      </div>
      <ReportFilters onChange={setFilters} showUsers={false} />
      <ReportStatCards cards={cards} loading={loading} />
      {buckets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {buckets.map((b) => (
            <div key={b.label} className="rounded-lg border bg-card p-6">
              <h3 className="text-lg font-semibold">{b.label}</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total Records</dt>
                  <dd className="font-medium">{b.total.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Retention Days</dt>
                  <dd className="font-medium">{b.retention_days}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Oldest Record</dt>
                  <dd className="font-medium">
                    {b.oldest ? new Date(b.oldest).toLocaleDateString() : '-'}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
      <ExportBar
        reportType="data-retention"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
