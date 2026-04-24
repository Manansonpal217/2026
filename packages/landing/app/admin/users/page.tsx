'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users,
  Plus,
  Search,
  UserCog,
  Building2,
  MoreHorizontal,
  Pencil,
  Ban,
  CheckCircle2,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { orgMemberRoleDisplayLabel } from '@/lib/roles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CreateUserDialog } from '../create-user-dialog'

type OrgRow = {
  id: string
  name: string
  slug: string
  status: string
  plan: string
  created_at: string
}

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at: string
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'OWNER':
    case 'super_admin':
      return 'bg-violet-500/15 text-violet-700 dark:text-violet-400'
    case 'admin':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
    case 'manager':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    case 'SUSPENDED':
      return 'bg-red-500/15 text-red-700 dark:text-red-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function relativeDate(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: [0, 0, 0.2, 1] as const },
  }),
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const isPlatformAdmin = session?.user?.is_platform_admin === true

  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [orgId, setOrgId] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const selectedOrg = useMemo(() => orgs.find((o) => o.id === orgId), [orgs, orgId])

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [users, searchQuery])

  const stats = useMemo(() => {
    const active = users.filter((u) => u.status === 'ACTIVE').length
    const admins = users.filter(
      (u) => u.role === 'admin' || u.role === 'super_admin' || u.role === 'OWNER'
    ).length
    return { total: users.length, active, admins }
  }, [users])

  const loadOrgs = useCallback(async () => {
    setLoadingOrgs(true)
    try {
      const { data } = await api.get<{ organizations: OrgRow[] }>('/v1/platform/orgs', {
        params: { page: 1, limit: 200 },
      })
      const list = data.organizations ?? []
      setOrgs(list)
      setOrgId((prev) => {
        if (prev && list.some((o) => o.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    } catch {
      adminToast.error('Failed to load organizations.')
    } finally {
      setLoadingOrgs(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    if (!orgId) {
      setUsers([])
      setTotal(0)
      return
    }
    setLoadingUsers(true)
    try {
      const { data } = await api.get<{ users: UserRow[]; total: number }>(
        `/v1/platform/orgs/${encodeURIComponent(orgId)}/users`,
        { params: { page: 1, limit: 100 } }
      )
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch {
      adminToast.error('Failed to load users for this organization.')
    } finally {
      setLoadingUsers(false)
    }
  }, [orgId])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!orgId) setCreateOpen(false)
  }, [orgId])

  return (
    <div className="space-y-6">
      {isPlatformAdmin && (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          orgId={orgId}
          orgLabel={selectedOrg ? `${selectedOrg.name} (${selectedOrg.slug})` : undefined}
          orgSlug={selectedOrg?.slug}
          onCreated={loadUsers}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">All Users</h1>
            <p className="text-sm text-muted-foreground">Manage users across all organizations</p>
          </div>
        </div>
        {total > 0 && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {total} user{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Org selector */}
      {loadingOrgs ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-10 w-64" />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>Organization</span>
            </div>
            <select
              className="flex h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              value={orgId}
              onChange={(e) => {
                setOrgId(e.target.value)
                setSearchQuery('')
              }}
              disabled={orgs.length === 0}
            >
              {orgs.length === 0 ? (
                <option value="">No organizations</option>
              ) : (
                orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}

      {/* Stats row */}
      {orgId && !loadingOrgs && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {loadingUsers ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <Skeleton className="mb-2 h-4 w-20" />
                  <Skeleton className="h-7 w-12" />
                </div>
              ))}
            </>
          ) : (
            <>
              <motion.div
                custom={0}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-xl border border-l-4 border-border border-l-blue-500 bg-card p-4"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  Total Users
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
              </motion.div>

              <motion.div
                custom={1}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-xl border border-l-4 border-border border-l-emerald-500 bg-card p-4"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Active
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{stats.active}</p>
              </motion.div>

              <motion.div
                custom={2}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-xl border border-l-4 border-border border-l-violet-500 bg-card p-4"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <UserCog className="h-3.5 w-3.5 text-violet-500" />
                  Admins
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{stats.admins}</p>
              </motion.div>
            </>
          )}
        </div>
      )}

      {/* Search bar + New user button */}
      {orgId && !loadingOrgs && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search users by name or email..."
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {isPlatformAdmin && (
            <Button
              className="shrink-0 gap-2"
              disabled={!orgId}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New user
            </Button>
          )}
        </div>
      )}

      {/* User table */}
      {loadingOrgs ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : loadingUsers ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
                {isPlatformAdmin && (
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {!orgId || filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={isPlatformAdmin ? 6 : 5} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        {!orgId
                          ? 'Select an organization to view users.'
                          : searchQuery
                            ? 'No users match your search.'
                            : 'No users in this organization.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          roleBadgeClass(u.role)
                        )}
                      >
                        {orgMemberRoleDisplayLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          statusBadgeClass(u.status)
                        )}
                      >
                        {u.status === 'ACTIVE'
                          ? 'Active'
                          : u.status === 'SUSPENDED'
                            ? 'Suspended'
                            : u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {relativeDate(u.created_at)}
                    </td>
                    {isPlatformAdmin && (
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit role
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              {u.status === 'SUSPENDED' ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Unsuspend
                                </>
                              ) : (
                                <>
                                  <Ban className="h-3.5 w-3.5" />
                                  Suspend
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
