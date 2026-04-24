'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2, KeyRound, Save, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { OrgAgentTokenPanel } from '@/app/admin/org-agent-token-panel'
import { cn } from '@/lib/utils'
import { orgMemberRoleDisplayLabel } from '@/lib/roles'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at: string
}

const PLAN_OPTIONS = [
  { value: 'TRIAL', label: 'Trial', color: 'border-amber-500 bg-amber-500/10 text-amber-700' },
  { value: 'STANDARD', label: 'Standard', color: 'border-blue-500 bg-blue-500/10 text-blue-700' },
  {
    value: 'PROFESSIONAL',
    label: 'Professional',
    color: 'border-violet-500 bg-violet-500/10 text-violet-700',
  },
]

const STATUS_OPTIONS = [
  {
    value: 'ACTIVE',
    label: 'Active',
    color: 'border-emerald-500 bg-emerald-500/10 text-emerald-700',
  },
  { value: 'SUSPENDED', label: 'Suspended', color: 'border-red-500 bg-red-500/10 text-red-700' },
]

const ROLE_STYLES: Record<string, string> = {
  OWNER: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  super_admin: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  admin: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  manager: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  employee: 'bg-muted text-muted-foreground',
}

export default function EditOrgPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const searchParams = useSearchParams()
  const router = useRouter()

  const [name, setName] = useState(searchParams?.get('name') ?? '')
  const [slug, setSlug] = useState(searchParams?.get('slug') ?? '')
  const [plan, setPlan] = useState(searchParams?.get('plan')?.toUpperCase() ?? 'TRIAL')
  const [status, setStatus] = useState(searchParams?.get('status')?.toUpperCase() ?? 'ACTIVE')
  const [saving, setSaving] = useState(false)

  // Users list
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  const loadUsers = useCallback(async () => {
    if (!id) return
    setLoadingUsers(true)
    try {
      const { data } = await api.get<{ users: UserRow[] }>(
        `/v1/platform/orgs/${encodeURIComponent(id)}/users`,
        { params: { page: 1, limit: 50 } }
      )
      setUsers(data.users ?? [])
    } catch {
      /* noop */
    } finally {
      setLoadingUsers(false)
    }
  }, [id])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/v1/platform/orgs/${id}`, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        plan: plan.trim(),
        status,
      })
      adminToast.success('Organization updated')
      router.push('/admin/orgs')
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      adminToast.error(ax.response?.data?.message ?? 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Back + header */}
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" asChild>
          <Link href="/admin/orgs">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All organizations
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner ring-1 ring-primary/20">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {name || 'Edit organization'}
            </h2>
            <p className="text-sm text-muted-foreground">{slug || 'Organization details'}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={onSubmit}>
            <div className="rounded-xl border border-border/60 bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold text-foreground">Organization details</h3>
                <p className="text-xs text-muted-foreground">Core identity and billing plan</p>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Acme Inc"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-slug">Slug</Label>
                    <Input
                      id="edit-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      required
                      pattern="[a-z0-9\-]+"
                      title="Lowercase letters, numbers, and hyphens only"
                      placeholder="acme-inc"
                    />
                  </div>
                </div>

                {/* Plan selector */}
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <div className="flex flex-wrap gap-2">
                    {PLAN_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPlan(p.value)}
                        className={cn(
                          'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all',
                          plan === p.value
                            ? p.color
                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status selector */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setStatus(s.value)}
                        className={cn(
                          'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all',
                          status === s.value
                            ? s.color
                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/admin/orgs">Cancel</Link>
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>

          {/* Agent token */}
          <OrgAgentTokenPanel orgId={id} orgName={name} />
        </div>

        {/* Right column — users */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Users</h3>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {users.length}
              </span>
            </div>
            <div className="divide-y divide-border/50">
              {loadingUsers ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : users.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No users in this organization
                </div>
              ) : (
                users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {u.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                        ROLE_STYLES[u.role] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {orgMemberRoleDisplayLabel(u.role)}
                    </span>
                  </div>
                ))
              )}
            </div>
            {users.length > 0 && (
              <div className="border-t border-border px-4 py-2.5">
                <Link
                  href={`/admin/users?org=${id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all users &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
