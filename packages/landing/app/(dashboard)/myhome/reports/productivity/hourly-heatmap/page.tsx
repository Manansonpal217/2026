'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Clock, Calendar, Activity, BarChart3 } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ExportBar } from '@/components/reports/ExportBar'

interface HeatmapCell {
  day_of_week: number
  hour: number
  total_sec: number
  session_count: number
}

interface HeatmapData {
  heatmap: HeatmapCell[]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function HourlyHeatmapPage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/productivity/hourly-heatmap', { params })
      .then((r) => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filters])

  const cells = data?.heatmap ?? []

  const grid = useMemo(() => {
    const map = new Map<string, number>()
    let max = 0
    for (const c of cells) {
      const key = `${c.day_of_week}-${c.hour}`
      map.set(key, c.total_sec)
      if (c.total_sec > max) max = c.total_sec
    }
    return { map, max }
  }, [cells])

  const totalActiveHours = cells.reduce((s, c) => s + c.total_sec, 0) / 3600

  const peakHourEntry =
    cells.length > 0 ? cells.reduce((best, c) => (c.total_sec > best.total_sec ? c : best)) : null

  const dayTotals = DAYS.map((_, di) =>
    cells.filter((c) => c.day_of_week === di).reduce((s, c) => s + c.total_sec, 0)
  )
  const busiestDayIdx = dayTotals.indexOf(Math.max(...dayTotals))

  const activeDays = new Set(cells.map((c) => c.day_of_week)).size || 1
  const avgDailyHours = totalActiveHours / activeDays

  const cards = [
    {
      label: 'Peak Hour',
      value: peakHourEntry ? `${String(peakHourEntry.hour).padStart(2, '0')}:00` : '—',
      icon: Clock,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Busiest Day',
      value: dayTotals.some((d) => d > 0) ? DAYS[busiestDayIdx] : '—',
      icon: Calendar,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Total Active Hours',
      value: totalActiveHours.toFixed(1),
      icon: Activity,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Avg Daily Hours',
      value: avgDailyHours.toFixed(1),
      icon: BarChart3,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
  ]

  function intensity(day: number, hour: number): string {
    const val = grid.map.get(`${day}-${hour}`) ?? 0
    if (grid.max === 0 || val === 0) return 'bg-muted/30'
    const ratio = val / grid.max
    if (ratio > 0.75) return 'bg-green-600'
    if (ratio > 0.5) return 'bg-green-500'
    if (ratio > 0.25) return 'bg-green-400'
    return 'bg-green-200'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hourly Heatmap</h1>
        <p className="text-sm text-muted-foreground">
          Visualise when your team is most active throughout the week.
        </p>
      </div>
      <ReportFilters onChange={setFilters} />
      <ReportStatCards cards={cards} loading={loading} />
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Activity Heatmap</h2>
        {loading ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="inline-grid gap-1"
              style={{ gridTemplateColumns: `80px repeat(24, 28px)` }}
            >
              {/* Header row */}
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-center text-[10px] text-muted-foreground">
                  {h}
                </div>
              ))}
              {/* Data rows */}
              {DAYS.map((day, di) => (
                <Fragment key={day}>
                  <div className="flex items-center text-xs font-medium">{day}</div>
                  {HOURS.map((h) => (
                    <div
                      key={`${di}-${h}`}
                      className={`h-6 w-7 rounded-sm ${intensity(di, h)}`}
                      title={`${day} ${h}:00 — ${((grid.map.get(`${di}-${h}`) ?? 0) / 60).toFixed(0)} min`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
      <ExportBar
        reportType="productivity-hourly-heatmap"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
