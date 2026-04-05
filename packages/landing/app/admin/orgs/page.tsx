'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Building2,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  created_at: string
}

type CreateOrgForm = {
  org_name: string
  slug: string
  plan: string
  admin_email: string
  admin_name: string
  timezone: string
  password: string
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

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export default function AdminOrgsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canMutatePlatformOrgs = session?.user?.is_platform_admin === true

  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenOrg, setTokenOrg] = useState<{ id: string; name: string } | null>(null)

  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [statusTarget, setStatusTarget] = useState<{
    org: OrgRow
    nextStatus: 'ACTIVE' | 'SUSPENDED'
  } | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateOrgForm>({
    org_name: '',
    slug: '',
    plan: 'TRIAL',
    admin_email: '',
    admin_name: '',
    timezone: 'UTC',
    password: '',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.get<{ organizations: OrgRow[]; total: number }>(
        '/v1/platform/orgs',
        { params: { page: 1, limit: 200 } }
      )
      setOrgs(data.organizations ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Failed to load organizations.')
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

  async function applyStatusChange() {
    if (!statusTarget) return
    setStatusError(null)
    setStatusSaving(true)
    try {
      await api.patch(`/v1/platform/orgs/${statusTarget.org.id}`, {
        status: statusTarget.nextStatus,
      })
      setStatusTarget(null)
      await load()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setStatusError(ax.response?.data?.message ?? 'Could not update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      await api.post('/v1/platform/orgs', {
        org_name: createForm.org_name,
        slug: createForm.slug,
        full_name: createForm.admin_name,
        email: createForm.admin_email,
        password: createForm.password || 'TempPass123!',
      })
      setCreateOpen(false)
      setCreateForm({
        org_name: '',
        slug: '',
        plan: 'TRIAL',
        admin_email: '',
        admin_name: '',
        timezone: 'UTC',
        password: '',
      })
      await load()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setCreateError(ax.response?.data?.message ?? 'Could not create organization.')
    } finally {
      setCreating(false)
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
            <p className="text-sm">
              <span className="font-medium text-foreground">{statusTarget.org.name}</span> ·{' '}
              {statusTarget.org.slug}
            </p>
          )}
          {statusError && <p className="text-sm text-destructive">{statusError}</p>}
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
                ? 'Updating…'
                : statusTarget?.nextStatus === 'SUSPENDED'
                  ? 'Suspend'
                  : 'Unsuspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Org Slide-over */}
      <AnimatePresence>
        {createOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[190] bg-black/40"
              onClick={() => setCreateOpen(false)}
            />
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 z-[200] flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">Create Organization</h2>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => void handleCreate(e)}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
                <div>
                  <Label>Org name *</Label>
                  <Input
                    className="mt-1"
                    value={createForm.org_name}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        org_name: e.target.value,
                        slug: toSlug(e.target.value),
                      }))
                    }
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <Label>Slug</Label>
                  <Input
                    className="mt-1"
                    value={createForm.slug}
                    onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                    pattern="^[a-z0-9-]+$"
                    minLength={2}
                    maxLength={40}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lowercase letters, numbers, hyphens only.
                  </p>
                </div>
                <div>
                  <Label>Plan</Label>
                  <div className="mt-1 flex gap-2">
                    {['TRIAL', 'STANDARD', 'PROFESSIONAL'].map((p) => (
                      <label
                        key={p}
                        className={cn(
                          'flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
                          createForm.plan === p
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <input
                          type="radio"
                          name="plan"
                          value={p}
                          checked={createForm.plan === p}
                          onChange={() => setCreateForm((f) => ({ ...f, plan: p }))}
                          className="sr-only"
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Admin email *</Label>
                  <Input
                    className="mt-1"
                    type="email"
                    value={createForm.admin_email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, admin_email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Admin name *</Label>
                  <Input
                    className="mt-1"
                    value={createForm.admin_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, admin_name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Input
                    className="mt-1"
                    value={createForm.timezone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, timezone: e.target.value }))}
                    placeholder="e.g. America/New_York"
                  />
                </div>
                <div>
                  <Label>Temporary password</Label>
                  <Input
                    className="mt-1"
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    minLength={8}
                    placeholder="Min 8 chars (auto-generated if empty)"
                  />
                </div>
                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Organization'}
                </Button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Organizations</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{total} total</p>
        </div>
        {canMutatePlatformOrgs && (
          <Button
            className="shrink-0 gap-2 self-start sm:self-auto"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> New organization
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-8 text-sm"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">All plans</option>
          <option value="TRIAL">Trial</option>
          <option value="STANDARD">Standard</option>
          <option value="PROFESSIONAL">Professional</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Card grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No organizations match your filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => (
            <div
              key={o.id}
              className={cn(
                'rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
                o.status === 'SUSPENDED' && 'opacity-70'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{o.name}</p>
                    <p className="text-xs text-muted-foreground">{o.slug}</p>
                  </div>
                </div>
                {canMutatePlatformOrgs && (
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
                            `/admin/orgs/${o.id}/edit?name=${encodeURIComponent(o.name)}&slug=${o.slug}&plan=${o.plan}&status=${o.status}`
                          )
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                      {o.status === 'ACTIVE' ? (
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => {
                            setStatusError(null)
                            setStatusTarget({ org: o, nextStatus: 'SUSPENDED' })
                          }}
                        >
                          <Power className="h-3.5 w-3.5" /> Suspend
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => {
                            setStatusError(null)
                            setStatusTarget({ org: o, nextStatus: 'ACTIVE' })
                          }}
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
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    PLAN_STYLES[o.plan] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {o.plan}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    STATUS_STYLES[o.status] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {o.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Created{' '}
                {new Date(o.created_at).toLocaleDateString('en', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
