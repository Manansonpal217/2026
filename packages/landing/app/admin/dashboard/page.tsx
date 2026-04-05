'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Building2, MoreHorizontal, Pencil, Power, Users } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type AnalyticsData = {
  totals: {
    organizations: number
    users: number
    active_users_last_7_days: number
    new_organizations_last_7_days: number
    new_users_last_7_days: number
  }
  organizations_by_status: Record<string, number>
  organizations_by_plan: Record<string, number>
  users_by_status: Record<string, number>
  recent_organizations: RecentOrg[]
}

type RecentOrg = {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  user_count: number
  created_at: string
  last_active: string
}

const PLAN_COLORS: Record<string, string> = {
  TRIAL: '#f59e0b',
  FREE: '#6b7280',
  STANDARD: '#3b82f6',
  PROFESSIONAL: '#7c3aed',
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  SUSPENDED: 'bg-red-500/15 text-red-700 dark:text-red-400',
  TRIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: number | string
  icon: typeof Building2
  accent: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card p-4 shadow-sm',
        `border-l-2 ${accent}`
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function PlanDonut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).map(([name, value]) => ({ name, value }))
  const total = entries.reduce((s, e) => s + e.value, 0)

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No organizations yet.</p>
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-48 w-48">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={entries}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              animationDuration={800}
            >
              {entries.map((e) => (
                <Cell key={e.name} fill={PLAN_COLORS[e.name] ?? '#6b7280'} />
              ))}
            </Pie>
            <RechartsTooltip
              content={(props: Record<string, unknown>) => {
                const payload = props.payload as
                  | { payload?: { name: string; value: number } }[]
                  | undefined
                if (!payload?.[0]) return null
                const d = payload[0].payload!
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-muted-foreground">
                      {d.value} orgs ({total ? Math.round((d.value / total) * 100) : 0}%)
                    </p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.name} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: PLAN_COLORS[e.name] ?? '#6b7280' }}
            />
            <span className="text-sm text-foreground">{e.name}</span>
            <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
              {e.value}
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${total ? (e.value / total) * 100 : 0}%`,
                  backgroundColor: PLAN_COLORS[e.name] ?? '#6b7280',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: d } = await api.get<AnalyticsData>('/v1/platform/analytics')
      setData(d)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const suspendedCount = data?.organizations_by_status?.SUSPENDED ?? 0
  const trialCount = data?.organizations_by_plan?.TRIAL ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Platform Overview</h2>
        <p className="text-sm text-muted-foreground">
          Real-time platform metrics and recent organization activity.
        </p>
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total orgs"
            value={data.totals.organizations}
            icon={Building2}
            accent="border-l-blue-500"
          />
          <StatCard
            label="Active users (7d)"
            value={data.totals.active_users_last_7_days}
            icon={Users}
            accent="border-l-emerald-500"
          />
          <StatCard
            label="Trial orgs"
            value={trialCount}
            icon={AlertTriangle}
            accent="border-l-amber-500"
          />
          <StatCard
            label="Suspended orgs"
            value={suspendedCount}
            icon={Power}
            accent="border-l-red-500"
          />
        </div>
      ) : null}

      {/* Plan donut */}
      {data && (
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 font-semibold text-foreground">Organizations by Plan</h3>
          <PlanDonut data={data.organizations_by_plan} />
        </div>
      )}

      {/* Recent org activity table */}
      {data && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h3 className="font-semibold text-foreground">Recent Organization Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Org</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Users</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Last active</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.recent_organizations.map((org) => (
                  <tr key={org.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="font-medium text-foreground">{org.name}</p>
                        <p className="text-xs text-muted-foreground">{org.slug}</p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          org.plan === 'TRIAL'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : org.plan === 'PROFESSIONAL'
                              ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400'
                              : org.plan === 'STANDARD'
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                                : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {org.user_count}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {relativeTime(org.last_active)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLES[org.status] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() =>
                              router.push(
                                `/admin/orgs/${org.id}/edit?name=${encodeURIComponent(org.name)}&slug=${org.slug}&plan=${org.plan}&status=${org.status}`
                              )
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => router.push(`/admin/orgs?highlight=${org.id}`)}
                          >
                            <Users className="h-3.5 w-3.5" /> View Users
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {data.recent_organizations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No organizations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
