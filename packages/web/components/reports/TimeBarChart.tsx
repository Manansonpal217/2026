'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface TimeDataPoint {
  label: string
  seconds: number
  sessions: number
}

interface Props {
  data: TimeDataPoint[]
  className?: string
}

function secToHours(sec: number): number {
  return Math.round((sec / 3600) * 10) / 10
}

function secToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface TooltipPayloadEntry {
  value: number
  payload: TimeDataPoint
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const data = payload[0]
  return (
    <div className="bg-surface/95 backdrop-blur border border-border/50 rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      <p className="text-sm text-indigo-400">
        {secToHms(data.payload.seconds)}
      </p>
      <p className="text-xs text-muted-foreground">{data.payload.sessions} sessions</p>
    </div>
  )
}

export function TimeBarChart({ data, className }: Props) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 text-muted-foreground text-sm ${className ?? ''}`}>
        No time data for the selected period
      </div>
    )
  }

  const chartData = data.map((d) => ({ ...d, hours: secToHours(d.seconds) }))
  const maxHours = Math.max(...chartData.map((d) => d.hours), 1)

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgb(107 114 128)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}h`}
            tick={{ fill: 'rgb(107 114 128)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={[0, Math.ceil(maxHours * 1.2)]}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.hours >= maxHours * 0.8 ? 'rgb(99 102 241)' : 'rgb(99 102 241 / 0.5)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
