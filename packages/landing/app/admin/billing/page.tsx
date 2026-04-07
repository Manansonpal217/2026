'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  CreditCard,
  DollarSign,
  MoreHorizontal,
  Send,
  Timer,
  Users,
  XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

type BillingOrg = {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  trial_ends_at: string | null
  trial_expired: boolean
  user_count: number
  created_at: string
}

const PLAN_STYLES: Record<string, string> = {
  TRIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  STANDARD: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  PROFESSIONAL: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  FREE: 'bg-muted text-muted-foreground',
}

const PIE_COLORS: Record<string, string> = {
  TRIAL: '#f59e0b',
  STANDARD: '#3b82f6',
  PROFESSIONAL: '#8b5cf6',
  FREE: '#94a3b8',
}

function getDaysLeft(trial_ends_at: string | null): number | null {
  if (!trial_ends_at) return null
  return Math.ceil((new Date(trial_ends_at).getTime() - Date.now()) / 86_400_000)
}

function trialStatus(org: BillingOrg): { label: string; cls: string; warn?: boolean } {
  if (org.trial_expired) return { label: 'Expired', cls: 'text-red-600 dark:text-red-400' }
  if (!org.trial_ends_at) return { label: '\u2014', cls: 'text-muted-foreground' }
  const daysLeft = getDaysLeft(org.trial_ends_at)!
  if (daysLeft <= 0) return { label: 'Expired', cls: 'text-red-600 dark:text-red-400' }
  if (daysLeft <= 7)
    return { label: `${daysLeft}d left`, cls: 'text-amber-600 dark:text-amber-400', warn: true }
  return { label: `${daysLeft}d left`, cls: 'text-muted-foreground' }
}

function getRowTint(org: BillingOrg): string {
  if (org.trial_expired) return 'bg-red-500/[0.04] dark:bg-red-500/[0.06]'
  if (org.trial_ends_at) {
    const d = getDaysLeft(org.trial_ends_at)
    if (d !== null && d <= 0) return 'bg-red-500/[0.04] dark:bg-red-500/[0.06]'
    if (d !== null && d <= 7) return 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]'
  }
  return ''
}

const QUICK_DAYS = [7, 14, 30, 60, 90] as const

export default function AdminBillingPage() {
  const [orgs, setOrgs] = useState<BillingOrg[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notifying, setNotifying] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmNotify, setConfirmNotify] = useState(false)

  // Extend trial dialog state
  const [extendDialog, setExtendDialog] = useState<{ org: BillingOrg } | null>(null)
  const [extendDays, setExtendDays] = useState<number>(30)
  const [customDays, setCustomDays] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [extending, setExtending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ orgs: BillingOrg[]; total: number }>(
        '/v1/platform/billing',
        { params: { limit: 100 } }
      )
      setOrgs(data.orgs ?? [])
      setTotal(data.total ?? 0)
    } catch {
      adminToast.error('Failed to load billing data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Stats
  const stats = useMemo(() => {
    const revenueOrgs = orgs.filter(
      (o) => o.plan === 'STANDARD' || o.plan === 'PROFESSIONAL'
    ).length
    const activeTrials = orgs.filter(
      (o) => o.trial_ends_at && !o.trial_expired && getDaysLeft(o.trial_ends_at)! > 0
    ).length
    const expiringSoon = orgs.filter((o) => {
      if (!o.trial_ends_at || o.trial_expired) return false
      const d = getDaysLeft(o.trial_ends_at)!
      return d > 0 && d <= 7
    }).length
    const expired = orgs.filter(
      (o) => o.trial_expired || (o.trial_ends_at && getDaysLeft(o.trial_ends_at)! <= 0)
    ).length
    return { revenueOrgs, activeTrials, expiringSoon, expired }
  }, [orgs])

  // Plan distribution for chart
  const planData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of orgs) {
      counts[o.plan] = (counts[o.plan] || 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [orgs])

  async function sendNotifications() {
    setNotifying(true)
    try {
      const { data } = await api.post<{ orgs_notified: number; notifications_created: number }>(
        '/v1/platform/billing/notify'
      )
      adminToast.success(
        'Notifications sent',
        `Notified ${data.orgs_notified} orgs, ${data.notifications_created} notifications created.`
      )
    } catch {
      adminToast.error('Failed to send notifications.')
    } finally {
      setNotifying(false)
      setConfirmNotify(false)
    }
  }

  async function markPaid(orgId: string) {
    setActionLoading(orgId)
    try {
      await api.patch(`/v1/platform/billing/${orgId}/paid`)
      await load()
      adminToast.success('Marked as paid')
    } catch {
      adminToast.error('Could not mark as paid.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleExtendTrial() {
    if (!extendDialog) return
    const days = useCustom ? parseInt(customDays, 10) : extendDays
    if (!days || days < 1 || days > 365) {
      adminToast.error('Please enter a valid number of days (1-365).')
      return
    }
    setExtending(true)
    try {
      await api.patch(`/v1/platform/billing/${extendDialog.org.id}/extend-trial`, { days })
      await load()
      adminToast.success('Trial extended', `Extended by ${days} days.`)
      setExtendDialog(null)
    } catch {
      adminToast.error('Could not extend trial.')
    } finally {
      setExtending(false)
    }
  }

  function openExtendDialog(org: BillingOrg) {
    setExtendDialog({ org })
    setExtendDays(30)
    setCustomDays('')
    setUseCustom(false)
  }

  const statCards = [
    {
      label: 'Total Revenue Orgs',
      value: stats.revenueOrgs,
      icon: DollarSign,
      gradient: 'from-emerald-500/10 to-emerald-500/5',
      border: 'border-l-emerald-500',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Active Trials',
      value: stats.activeTrials,
      icon: Timer,
      gradient: 'from-blue-500/10 to-blue-500/5',
      border: 'border-l-blue-500',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Expiring Soon',
      value: stats.expiringSoon,
      icon: AlertTriangle,
      gradient: 'from-amber-500/10 to-amber-500/5',
      border: 'border-l-amber-500',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Expired Trials',
      value: stats.expired,
      icon: XCircle,
      gradient: 'from-red-500/10 to-red-500/5',
      border: 'border-l-red-500',
      iconColor: 'text-red-600 dark:text-red-400',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-600/10">
            <CreditCard className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Billing & Subscriptions
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage organization plans, trials, and payment notifications
            </p>
          </div>
        </div>
        {confirmNotify ? (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-sm text-muted-foreground">Send to all?</span>
            <Button
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void sendNotifications()}
              disabled={notifying}
            >
              {notifying ? 'Sending...' : 'Confirm'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmNotify(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={() => setConfirmNotify(true)} className="gap-2 self-start sm:self-auto">
            <Bell className="h-4 w-4" />
            Send Payment Notifications
          </Button>
        )}
      </div>

      {/* Summary Stats */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className={cn(
                'rounded-xl border border-border/60 border-l-4 bg-gradient-to-br p-4 shadow-sm',
                card.gradient,
                card.border
              )}
            >
              <div className="flex items-center justify-between">
                <card.icon className={cn('h-5 w-5', card.iconColor)} />
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {card.value}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{card.label}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Main Content: Table + Chart */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Billing Table */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="lg:col-span-2 overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm"
          >
            <div className="border-b border-border/60 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">Organizations</h3>
              <p className="text-xs text-muted-foreground">{total} total</p>
            </div>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-2.5 font-medium text-muted-foreground">Organization</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-center">
                    Users
                  </th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Trial Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {orgs.map((o) => {
                  const ts = trialStatus(o)
                  return (
                    <tr
                      key={o.id}
                      className={cn('transition-colors hover:bg-muted/30', getRowTint(o))}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{o.name}</p>
                        <p className="text-xs text-muted-foreground">{o.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            PLAN_STYLES[o.plan] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {o.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                          <Users className="h-3.5 w-3.5" />
                          {o.user_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            ts.cls
                          )}
                        >
                          {ts.warn && <AlertTriangle className="h-3 w-3" />}
                          {ts.label}
                        </span>
                        {o.trial_ends_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(o.trial_ends_at).toLocaleDateString('en', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            o.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-500/15 text-red-700 dark:text-red-400'
                          )}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={actionLoading === o.id}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="gap-2" onClick={() => void markPaid(o.id)}>
                              <Check className="h-3.5 w-3.5" /> Mark as Paid
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" onClick={() => openExtendDialog(o)}>
                              <CalendarClock className="h-3.5 w-3.5" /> Extend Trial
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => void sendNotifications()}
                            >
                              <Send className="h-3.5 w-3.5" /> Send Notification
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
                {orgs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-muted-foreground"
                    >
                      No organizations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </motion.div>

          {/* Plan Distribution Chart */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="rounded-xl border border-border/60 bg-card p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-foreground">Plan Distribution</h3>
            <p className="text-xs text-muted-foreground mb-4">{total} organizations</p>
            {planData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={planData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {planData.map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: unknown, name: unknown) => [String(value), String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {planData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ background: PIE_COLORS[entry.name] ?? '#94a3b8' }}
                        />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium tabular-nums text-foreground">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No data</p>
            )}
          </motion.div>
        </div>
      )}

      {/* Extend Trial Dialog */}
      <Dialog
        open={!!extendDialog}
        onOpenChange={(open) => {
          if (!open) setExtendDialog(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Extend Trial {extendDialog ? `\u2014 ${extendDialog.org.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {extendDialog?.org.trial_ends_at && (
              <p className="text-sm text-muted-foreground">
                Current trial ends:{' '}
                <span className="font-medium text-foreground">
                  {new Date(extendDialog.org.trial_ends_at).toLocaleDateString('en', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </p>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Quick select</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_DAYS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={!useCustom && extendDays === d ? 'default' : 'outline'}
                    onClick={() => {
                      setExtendDays(d)
                      setUseCustom(false)
                    }}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Or enter custom days</p>
              <input
                type="number"
                min={1}
                max={365}
                placeholder="e.g. 45"
                value={customDays}
                onChange={(e) => {
                  setCustomDays(e.target.value)
                  setUseCustom(true)
                }}
                onFocus={() => setUseCustom(true)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleExtendTrial()} disabled={extending} className="gap-2">
              <CalendarClock className="h-4 w-4" />
              {extending ? 'Extending...' : 'Extend Trial'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
