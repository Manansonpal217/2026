'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CreditCard,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { motion } from 'framer-motion'
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
}

const PLAN_STYLES: Record<string, string> = {
  TRIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  FREE: 'bg-muted text-muted-foreground',
  STANDARD: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  PROFESSIONAL: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
}

const USER_STATUS_COLORS: Record<string, { bg: string; bar: string }> = {
  ACTIVE: { bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
  SUSPENDED: { bg: 'bg-red-500/10', bar: 'bg-red-500' },
  INVITED: { bg: 'bg-sky-500/10', bar: 'bg-sky-500' },
}

type StatCardConfig = {
  label: string
  value: number | string
  icon: typeof Building2
  borderColor: string
  iconColor: string
  dotColor: string
}

function StatCard({ label, value, icon: Icon, borderColor, iconColor, dotColor }: StatCardConfig) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/25 p-4 shadow-sm',
        `border-l-2 ${borderColor}`
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -bottom-4 -right-4 h-20 w-20 rounded-full opacity-20 blur-2xl',
          dotColor
        )}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={cn('h-4 w-4', iconColor)} />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </motion.div>
  )
}

function PlanDonut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).map(([name, value]) => ({ name, value }))
  const total = entries.reduce((s, e) => s + e.value, 0)

  if (total === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No organizations yet.</p>
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={entries}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              animationDuration={800}
              stroke="none"
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
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-muted-foreground">
                      {d.value} org{d.value !== 1 ? 's' : ''} ({Math.round((d.value / total) * 100)}
                      %)
                    </p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
        </div>
      </div>
      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.name} className="flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: PLAN_COLORS[e.name] ?? '#6b7280' }}
            />
            <span className="min-w-[90px] text-sm text-foreground">{e.name}</span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">{e.value}</span>
            <span className="text-xs text-muted-foreground">
              ({total ? Math.round((e.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsersStatusPanel({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
  const total = entries.reduce((s, [, v]) => s + v, 0)

  if (total === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No users yet.</p>
  }

  return (
    <div className="space-y-3">
      {entries.map(([status, count]) => {
        const colors = USER_STATUS_COLORS[status] ?? { bg: 'bg-muted', bar: 'bg-muted-foreground' }
        const pct = total ? Math.round((count / total) * 100) : 0
        return (
          <div key={status} className={cn('rounded-lg p-3', colors.bg)}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{status}</span>
              <span className="tabular-nums text-muted-foreground">
                {count} ({pct}%)
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
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

const QUICK_ACTIONS = [
  {
    title: 'Create Organization',
    description: 'Set up a new organization on the platform',
    href: '/admin/orgs/new',
    icon: Plus,
    ring: 'ring-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Manage Billing',
    description: 'Review plans, invoices, and subscriptions',
    href: '/admin/billing',
    icon: CreditCard,
    ring: 'ring-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  {
    title: 'View All Users',
    description: 'Browse and manage platform users',
    href: '/admin/users',
    icon: Users,
    ring: 'ring-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
]

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Platform Dashboard
            </h2>
            <p className="text-sm text-muted-foreground">
              Real-time platform metrics and organization overview
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total Orgs"
            value={data.totals.organizations}
            icon={Building2}
            borderColor="border-l-blue-500"
            iconColor="text-blue-500/60"
            dotColor="bg-blue-500"
          />
          <StatCard
            label="Total Users"
            value={data.totals.users}
            icon={Users}
            borderColor="border-l-violet-500"
            iconColor="text-violet-500/60"
            dotColor="bg-violet-500"
          />
          <StatCard
            label="Active Users 7d"
            value={data.totals.active_users_last_7_days}
            icon={UserCheck}
            borderColor="border-l-emerald-500"
            iconColor="text-emerald-500/60"
            dotColor="bg-emerald-500"
          />
          <StatCard
            label="New Orgs 7d"
            value={data.totals.new_organizations_last_7_days}
            icon={TrendingUp}
            borderColor="border-l-sky-500"
            iconColor="text-sky-500/60"
            dotColor="bg-sky-500"
          />
          <StatCard
            label="New Users 7d"
            value={data.totals.new_users_last_7_days}
            icon={UserPlus}
            borderColor="border-l-amber-500"
            iconColor="text-amber-500/60"
            dotColor="bg-amber-500"
          />
          <StatCard
            label="Suspended Orgs"
            value={suspendedCount}
            icon={Power}
            borderColor="border-l-red-500"
            iconColor="text-red-500/60"
            dotColor="bg-red-500"
          />
        </div>
      ) : null}

      {/* Charts row */}
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-72 rounded-xl lg:col-span-3" />
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        </div>
      ) : data ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm lg:col-span-3">
            <h3 className="mb-5 text-sm font-semibold text-foreground">Organizations by Plan</h3>
            <PlanDonut data={data.organizations_by_plan} />
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-5 text-sm font-semibold text-foreground">Users by Status</h3>
            <UsersStatusPanel data={data.users_by_status} />
          </div>
        </div>
      ) : null}

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.href} href={action.href}>
            <div className="group rounded-xl border border-border/60 bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full ring-2',
                    action.ring
                  )}
                >
                  <action.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {action.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent orgs table */}
      {loading ? (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-5 w-56" />
          </div>
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-semibold text-foreground">Recent Organization Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Org
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Plan
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Users
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Last Active
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="w-16 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.recent_organizations.map((org) => (
                  <tr key={org.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orgs/${org.id}/edit?name=${encodeURIComponent(org.name)}&slug=${org.slug}&plan=${org.plan}&status=${org.status}`}
                        className="group/link"
                      >
                        <p className="font-medium text-foreground group-hover/link:text-primary transition-colors">
                          {org.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{org.slug}</p>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          PLAN_STYLES[org.plan] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {org.user_count}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {relativeTime(org.last_active)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          STATUS_STYLES[org.status] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
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
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-muted-foreground"
                    >
                      No organizations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-5 py-3">
            <Link href="/admin/orgs" className="text-sm font-medium text-primary hover:underline">
              View all organizations &rarr;
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
