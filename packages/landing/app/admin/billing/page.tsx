'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, CalendarClock, Check, CreditCard, MoreHorizontal } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

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
  FREE: 'bg-muted text-muted-foreground',
  STANDARD: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  PROFESSIONAL: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
}

function trialStatus(org: BillingOrg): { label: string; cls: string } {
  if (org.trial_expired) return { label: 'Expired', cls: 'text-red-600 dark:text-red-400' }
  if (!org.trial_ends_at) return { label: '—', cls: 'text-muted-foreground' }
  const end = new Date(org.trial_ends_at)
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86_400_000)
  if (daysLeft <= 0) return { label: 'Expired', cls: 'text-red-600 dark:text-red-400' }
  if (daysLeft <= 7)
    return { label: `${daysLeft}d left`, cls: 'text-amber-600 dark:text-amber-400' }
  return { label: `${daysLeft}d left`, cls: 'text-muted-foreground' }
}

export default function AdminBillingPage() {
  const [orgs, setOrgs] = useState<BillingOrg[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notifying, setNotifying] = useState(false)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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
      /* noop */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function sendNotifications() {
    setNotifying(true)
    setNotifyResult(null)
    try {
      const { data } = await api.post<{ orgs_notified: number; notifications_created: number }>(
        '/v1/platform/billing/notify'
      )
      setNotifyResult(
        `Notified ${data.orgs_notified} orgs, ${data.notifications_created} notifications sent.`
      )
    } catch {
      setNotifyResult('Failed to send notifications.')
    } finally {
      setNotifying(false)
    }
  }

  async function markPaid(orgId: string) {
    setActionLoading(orgId)
    try {
      await api.patch(`/v1/platform/billing/${orgId}/paid`)
      await load()
    } catch {
      /* noop */
    } finally {
      setActionLoading(null)
    }
  }

  async function extendTrial(orgId: string) {
    setActionLoading(orgId)
    try {
      await api.patch(`/v1/platform/billing/${orgId}/extend-trial`, { days: 30 })
      await load()
    } catch {
      /* noop */
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Billing</h2>
          <p className="text-sm text-muted-foreground">{total} organizations</p>
        </div>
        <Button
          onClick={() => void sendNotifications()}
          disabled={notifying}
          className="gap-2 self-start sm:self-auto"
        >
          <Bell className="h-4 w-4" />
          {notifying ? 'Sending…' : 'Send Payment Notifications'}
        </Button>
      </div>

      {notifyResult && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-sm',
            notifyResult.startsWith('Failed')
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          )}
        >
          {notifyResult}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Organization</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Users</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Trial</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orgs.map((o) => {
                const ts = trialStatus(o)
                return (
                  <tr key={o.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.slug}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          PLAN_STYLES[o.plan] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {o.plan}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {o.user_count}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs font-medium', ts.cls)}>{ts.label}</span>
                      {o.trial_ends_at && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(o.trial_ends_at).toLocaleDateString('en', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          o.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-500/15 text-red-700 dark:text-red-400'
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            disabled={actionLoading === o.id}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" onClick={() => void markPaid(o.id)}>
                            <Check className="h-3.5 w-3.5" /> Mark as Paid
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => void extendTrial(o.id)}
                          >
                            <CalendarClock className="h-3.5 w-3.5" /> Extend Trial (+30d)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => void sendNotifications()}
                          >
                            <CreditCard className="h-3.5 w-3.5" /> Send Notification
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No organizations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
