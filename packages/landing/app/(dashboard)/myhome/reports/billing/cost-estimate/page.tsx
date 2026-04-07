'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'
import { AlertCircle, DollarSign, Clock, TrendingUp, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { ReportFilters, type ReportFilterValues } from '@/components/reports/ReportFilters'
import { ReportPageHeader } from '@/components/reports/ReportPageHeader'
import { ReportStatCards } from '@/components/reports/ReportStatCards'
import { ReportTable, type Column } from '@/components/reports/ReportTable'
import { ExportBar } from '@/components/reports/ExportBar'

interface CostRow extends Record<string, unknown> {
  user_id: string
  user_name: string
  total_hours: number
  rate_per_hour: number
  currency: string
  estimated_cost: number
  missing_rate?: boolean
}

interface CostData {
  users: CostRow[]
  total_cost: number
  currency: string
  missing_rate_count?: number
  has_rates?: boolean
}

function normalizeCostPayload(raw: unknown): CostData {
  if (raw && typeof raw === 'object' && 'users' in raw && Array.isArray((raw as CostData).users)) {
    const d = raw as CostData
    return {
      users: d.users.map(normalizeRow),
      total_cost: typeof d.total_cost === 'number' ? d.total_cost : 0,
      currency: typeof d.currency === 'string' ? d.currency : 'INR',
      missing_rate_count:
        typeof d.missing_rate_count === 'number' ? d.missing_rate_count : undefined,
      has_rates: typeof d.has_rates === 'boolean' ? d.has_rates : undefined,
    }
  }
  const arr = Array.isArray(raw) ? raw : []
  const users: CostRow[] = arr.map((row: Record<string, unknown>, i) => {
    const hours = Number(row.hours ?? row.total_hours ?? 0)
    const cost = Number(row.cost ?? row.estimated_cost ?? 0)
    const uid = typeof row.user_id === 'string' ? row.user_id : `user-${i}`
    return {
      user_id: uid,
      user_name: String(row.user_name ?? 'Unknown'),
      total_hours: hours,
      rate_per_hour: Number(row.rate_per_hour ?? 0),
      currency: String(row.currency ?? 'INR'),
      estimated_cost: cost,
      missing_rate: Boolean(row.missing_rate),
    }
  })
  const total_cost = users.reduce((s, u) => s + u.estimated_cost, 0)
  const currency = users.find((u) => !u.missing_rate)?.currency ?? users[0]?.currency ?? 'INR'
  const missing_rate_count = users.filter((u) => u.missing_rate).length
  return {
    users,
    total_cost,
    currency,
    missing_rate_count,
    has_rates: missing_rate_count < users.length,
  }
}

function normalizeRow(row: CostRow): CostRow {
  return {
    ...row,
    total_hours: Number(row.total_hours ?? 0),
    rate_per_hour: Number(row.rate_per_hour ?? 0),
    estimated_cost: Number(row.estimated_cost ?? 0),
    currency: String(row.currency ?? 'INR'),
  }
}

export default function CostEstimatePage() {
  const [filters, setFilters] = useState<ReportFilterValues | null>(null)
  const [data, setData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filters) return
    setLoading(true)
    setError(null)
    const params: Record<string, string> = { from: filters.from, to: filters.to }
    if (filters.userIds.length) params.user_ids = filters.userIds.join(',')
    api
      .get('/v1/reports/billing/cost-estimate', { params })
      .then((r) => setData(normalizeCostPayload(r.data.data)))
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load report')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [filters])

  const users = data?.users ?? []
  const totalHours = users.reduce((s, u) => s + u.total_hours, 0)
  const withRate = users.filter((u) => !u.missing_rate)
  const avgRate =
    withRate.length > 0 ? withRate.reduce((s, u) => s + u.rate_per_hour, 0) / withRate.length : 0

  const totalCost = data?.total_cost ?? users.reduce((s, u) => s + u.estimated_cost, 0)
  const displayCurrency = data?.currency ?? users[0]?.currency ?? 'INR'
  const missingRateCount = data?.missing_rate_count ?? users.filter((u) => u.missing_rate).length
  const hasRates = data?.has_rates ?? withRate.length > 0

  const totalCostDisplay =
    typeof totalCost === 'number' && !Number.isNaN(totalCost)
      ? `${displayCurrency} ${totalCost.toLocaleString()}`
      : '—'

  const cards = [
    {
      label: 'Total Cost',
      value: users.length ? totalCostDisplay : '—',
      icon: DollarSign,
      accent: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
      subtitle: !hasRates && users.length > 0 ? 'Add per-user rates to calculate cost' : undefined,
    },
    {
      label: 'Total Hours',
      value: totalHours.toFixed(1),
      icon: Clock,
      accent: 'border-l-blue-500',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Avg rate',
      value: withRate.length ? avgRate.toFixed(2) : '—',
      icon: TrendingUp,
      accent: 'border-l-violet-500',
      iconColor: 'text-violet-500',
      subtitle: withRate.length ? `Across ${withRate.length} user(s) with a rate` : undefined,
    },
    {
      label: 'Users',
      value: users.length.toString(),
      icon: Users,
      accent: 'border-l-amber-500',
      iconColor: 'text-amber-500',
      subtitle: missingRateCount > 0 ? `${missingRateCount} without rate` : undefined,
    },
  ]

  const columns: Column<CostRow>[] = [
    {
      key: 'user_name',
      label: 'User',
      render: (row) => row.user_name,
      sortable: true,
      sortValue: (row) => row.user_name,
    },
    {
      key: 'total_hours',
      label: 'Hours',
      render: (row) => row.total_hours.toFixed(1),
      sortable: true,
      sortValue: (row) => row.total_hours,
      align: 'right',
    },
    {
      key: 'rate_per_hour',
      label: 'Rate/hr',
      render: (row) => (row.missing_rate ? '—' : row.rate_per_hour.toFixed(2)),
      sortable: true,
      sortValue: (row) => (row.missing_rate ? -1 : row.rate_per_hour),
      align: 'right',
    },
    {
      key: 'currency',
      label: 'Currency',
      render: (row) => row.currency,
      sortable: true,
      sortValue: (row) => row.currency,
    },
    {
      key: 'estimated_cost',
      label: 'Est. cost',
      render: (row) =>
        row.missing_rate ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          row.estimated_cost.toLocaleString()
        ),
      sortable: true,
      sortValue: (row) => (row.missing_rate ? -1 : row.estimated_cost),
      align: 'right',
    },
  ]

  const chartData = useMemo(
    () =>
      users.map((u) => ({
        user_name: u.user_name.length > 14 ? `${u.user_name.slice(0, 12)}…` : u.user_name,
        hours: Math.round(u.total_hours * 10) / 10,
        cost: u.missing_rate ? 0 : u.estimated_cost,
      })),
    [users]
  )

  const showHoursChart = users.length > 0 && (!hasRates || chartData.some((d) => d.hours > 0))

  return (
    <div className="space-y-8">
      <ReportPageHeader
        title="Cost estimate"
        description="Costs from tracked time × each user’s billing rate. Rates come from User rate records in your org; without a rate, hours still appear but cost stays empty."
      />

      <ReportFilters onChange={setFilters} />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && users.length > 0 && missingRateCount > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100">
              {missingRateCount} user{missingRateCount === 1 ? '' : 's'} ha
              {missingRateCount === 1 ? 's' : 've'} no billing rate
            </p>
            <p className="mt-1 text-muted-foreground">
              Add <strong className="text-foreground">UserRate</strong> rows for those users (org
              settings / billing) so estimated cost and totals populate.
            </p>
          </div>
        </div>
      )}

      <ReportStatCards cards={cards} loading={loading} />

      {!loading && showHoursChart && (
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h3 className="text-sm font-semibold">Hours & cost by user</h3>
            {!hasRates && (
              <span className="text-xs text-muted-foreground">
                Bars show hours until rates exist
              </span>
            )}
          </div>
          <div className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 56 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/60"
                  vertical={false}
                />
                <XAxis
                  dataKey="user_name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={70}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                {hasRates && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: displayCurrency,
                      angle: 90,
                      position: 'insideRight',
                      fontSize: 11,
                    }}
                  />
                )}
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value ?? 0)
                    if (String(name).toLowerCase().includes('hour')) return [`${v} h`, 'Hours']
                    return [`${displayCurrency} ${v.toLocaleString()}`, 'Cost']
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="left"
                  dataKey="hours"
                  name="Hours"
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                {hasRates && (
                  <Bar
                    yAxisId="right"
                    dataKey="cost"
                    name={`Cost (${displayCurrency})`}
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <ReportTable
        columns={columns}
        data={users}
        loading={loading}
        keyField="user_id"
        emptyMessage="No completed sessions in this date range — try a wider range or check that time entries are approved if your org requires approval."
      />

      <ExportBar
        reportType="cost-estimate"
        params={{ from: filters?.from ?? '', to: filters?.to ?? '' }}
      />
    </div>
  )
}
