'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import {
  Building2,
  Calendar,
  ChevronDown,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  Users,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OrgAgentTokenDialog } from '../org-agent-token-panel'
import { cn } from '@/lib/utils'

type OrgRow = {
  id: string
  name: string
  slug: string
  status: string
  plan: string
  user_count?: number
  created_at: string
  last_active?: string
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

const PLAN_ACCENT: Record<string, string> = {
  TRIAL: 'border-l-amber-500',
  FREE: 'border-l-gray-400',
  STANDARD: 'border-l-blue-500',
  PROFESSIONAL: 'border-l-violet-500',
}

const filterSelectClass =
  'h-10 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-border bg-input py-0 pl-3 pr-9 text-sm text-foreground shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.04)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50 sm:w-44'

function relativeTime(iso: string | undefined): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export default function AdminOrgsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canMutate = session?.user?.is_platform_admin === true

  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tokenOrg, setTokenOrg] = useState<{ id: string; name: string } | null>(null)

  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [statusTarget, setStatusTarget] = useState<{
    org: OrgRow
    nextStatus: 'ACTIVE' | 'SUSPENDED'
  } | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ organizations: OrgRow[]; total: number }>(
        '/v1/platform/orgs',
        { params: { page: 1, limit: 200 } }
      )
      setOrgs(data.organizations ?? [])
      setTotal(data.total ?? 0)
    } catch {
      adminToast.error('Failed to load organizations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    let result = orgs
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)
      )
    }
    if (planFilter) result = result.filter((o) => o.plan === planFilter)
    if (statusFilter) result = result.filter((o) => o.status === statusFilter)
    return result
  }, [orgs, search, planFilter, statusFilter])

  const stats = useMemo(() => {
    const active = orgs.filter((o) => o.status === 'ACTIVE').length
    const suspended = orgs.filter((o) => o.status === 'SUSPENDED').length
    const trial = orgs.filter((o) => o.plan === 'TRIAL').length
    const paid = orgs.filter((o) => o.plan === 'STANDARD' || o.plan === 'PROFESSIONAL').length
    return { active, suspended, trial, paid }
  }, [orgs])

  async function applyStatusChange() {
    if (!statusTarget) return
    setStatusSaving(true)
    try {
      await api.patch(`/v1/platform/orgs/${statusTarget.org.id}`, {
        status: statusTarget.nextStatus,
      })
      adminToast.success(
        statusTarget.nextStatus === 'SUSPENDED'
          ? 'Organization suspended'
          : 'Organization activated'
      )
      setStatusTarget(null)
      await load()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      adminToast.error(ax.response?.data?.message ?? 'Could not update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {tokenOrg && (
        <OrgAgentTokenDialog
          key={tokenOrg.id}
          orgId={tokenOrg.id}
          orgName={tokenOrg.name}
          open
          onOpenChange={(o) => {
            if (!o) setTokenOrg(null)
          }}
        />
      )}

      {/* Suspend/Unsuspend dialog */}
      <Dialog
        open={statusTarget !== null}
        onOpenChange={(o) => {
          if (!o) setStatusTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.nextStatus === 'SUSPENDED'
                ? 'Suspend organization'
                : 'Unsuspend organization'}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.nextStatus === 'SUSPENDED'
                ? 'All active sessions will be invalidated. Members cannot sign in until unsuspended.'
                : 'Members can sign in again. Data is unchanged.'}
            </DialogDescription>
          </DialogHeader>
          {statusTarget && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{statusTarget.org.name}</p>
                <p className="text-xs text-muted-foreground">{statusTarget.org.slug}</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className={
                statusTarget?.nextStatus === 'SUSPENDED'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-none'
                  : undefined
              }
              onClick={() => void applyStatusChange()}
              disabled={statusSaving}
            >
              {statusSaving
                ? 'Updating...'
                : statusTarget?.nextStatus === 'SUSPENDED'
                  ? 'Suspend'
                  : 'Unsuspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner ring-1 ring-primary/20">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Organizations</h2>
            <p className="text-sm text-muted-foreground">{total} organizations on the platform</p>
          </div>
        </div>
        {canMutate && (
          <Button className="shrink-0 gap-2 self-start sm:self-auto" asChild>
            <Link href="/admin/orgs/new">
              <Plus className="h-4 w-4" /> New organization
            </Link>
          </Button>
        )}
      </div>

      {/* Stats row */}
      {!loading && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Active',
              value: stats.active,
              accent: 'border-l-emerald-500',
              color: 'text-emerald-600',
            },
            {
              label: 'Trial',
              value: stats.trial,
              accent: 'border-l-amber-500',
              color: 'text-amber-600',
            },
            {
              label: 'Paid',
              value: stats.paid,
              accent: 'border-l-blue-500',
              color: 'text-blue-600',
            },
            {
              label: 'Suspended',
              value: stats.suspended,
              accent: 'border-l-red-500',
              color: 'text-red-600',
            },
          ].map((s) => (
            <div
              key={s.label}
              className={cn(
                'rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3 shadow-sm border-l-2',
                s.accent
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className={cn('mt-0.5 text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search orgs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <div className="relative shrink-0 sm:w-44">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            aria-label="Filter by plan"
            className={filterSelectClass}
          >
            <option value="">All plans</option>
            <option value="TRIAL">Trial</option>
            <option value="STANDARD">Standard</option>
            <option value="PROFESSIONAL">Professional</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
        <div className="relative shrink-0 sm:w-44">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className={filterSelectClass}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
        {(search || planFilter || statusFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setPlanFilter('')
              setStatusFilter('')
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Card grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No organizations found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search || planFilter || statusFilter
              ? 'Try adjusting your filters'
              : 'Create your first organization to get started'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o, i) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
              className={cn(
                'group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-l-3',
                PLAN_ACCENT[o.plan] ?? 'border-l-gray-400',
                o.status === 'SUSPENDED' && 'opacity-60'
              )}
            >
              {/* Decorative glow */}
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
                style={{
                  background:
                    o.plan === 'PROFESSIONAL'
                      ? 'rgb(139 92 246)'
                      : o.plan === 'STANDARD'
                        ? 'rgb(59 130 246)'
                        : o.plan === 'TRIAL'
                          ? 'rgb(245 158 11)'
                          : 'rgb(107 114 128)',
                }}
              />

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orgs/${o.id}/edit?name=${encodeURIComponent(o.name)}&slug=${o.slug}&plan=${o.plan}&status=${o.status}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {o.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{o.slug}</p>
                  </div>
                </div>
                {canMutate && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() =>
                          router.push(
                            `/admin/orgs/${o.id}/edit?name=${encodeURIComponent(o.name)}&slug=${o.slug}&plan=${o.plan}&status=${o.status}`
                          )
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                      {o.status === 'ACTIVE' ? (
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => setStatusTarget({ org: o, nextStatus: 'SUSPENDED' })}
                        >
                          <Power className="h-3.5 w-3.5" /> Suspend
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => setStatusTarget({ org: o, nextStatus: 'ACTIVE' })}
                        >
                          <Power className="h-3.5 w-3.5" /> Unsuspend
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setTokenOrg({ id: o.id, name: o.name })}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Agent token
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" asChild>
                        <Link href={`/admin/users?org=${o.id}`}>
                          <Users className="h-3.5 w-3.5" /> View Users
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Badges + meta */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    PLAN_STYLES[o.plan] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {o.plan}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    STATUS_STYLES[o.status] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {o.status}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                {o.user_count !== undefined && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {o.user_count} users
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(o.created_at).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              {o.last_active && (
                <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                  Last active {relativeTime(o.last_active)}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
