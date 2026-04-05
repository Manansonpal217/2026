'use client'

import { useCallback, useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { InitialsAvatar as Avatar } from '@/components/ui/initials-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { isOrgAdminRole, PermissionKey } from '@/lib/roles'
import {
  DirectReportsMultiSelect,
  type DirectReportOption,
} from '@/components/DirectReportsMultiSelect'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at: string
  mfa_enabled: boolean
  manager_id: string | null
  can_add_offline_time: boolean | null
  manager: { id: string; name: string; email: string } | null
}

type ManagerOption = { id: string; name: string; email: string; role: string }

const MANAGER_ROLES = new Set(['manager', 'admin', 'super_admin'])
const PAGE_SIZE = 25

function roleLabel(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin'
    case 'admin':
      return 'Admin'
    case 'manager':
      return 'Manager'
    case 'employee':
      return 'Employee'
    default:
      return role
  }
}

function roleBadgeVariant(role: string): 'indigo' | 'violet' | 'secondary' | 'warning' {
  switch (role) {
    case 'admin':
    case 'super_admin':
      return 'indigo'
    case 'manager':
      return 'violet'
    default:
      return 'secondary'
  }
}

function statusBadgeVariant(status: string): 'emerald' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'active':
      return 'emerald'
    case 'suspended':
      return 'destructive'
    case 'invited':
      return 'warning'
    default:
      return 'secondary'
  }
}

function TeamTableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-border/80">
          <td className="px-3 py-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-4 w-48" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-5 w-16 rounded-full" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-5 w-14 rounded-full" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-9 w-40" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-9 w-40" />
          </td>
          <td className="px-3 py-3">
            <Skeleton className="h-8 w-24" />
          </td>
        </tr>
      ))}
    </tbody>
  )
}

export default function OrganizationUsersPage() {
  const { data: session } = useSession()
  const selfId = session?.user?.id ?? ''

  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([])
  const [overrideUserIds, setOverrideUserIds] = useState<Set<string>>(new Set())

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'employee' | 'manager' | 'admin'>('employee')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  )

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<UserRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'employee' | 'manager' | 'admin'>('employee')
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active')
  const [editSaving, setEditSaving] = useState(false)
  const [editReportIds, setEditReportIds] = useState<string[]>([])
  const [assignablePool, setAssignablePool] = useState<DirectReportOption[]>([])
  const [assignableLoading, setAssignableLoading] = useState(false)
  const [reportsLoading, setReportsLoading] = useState(false)

  const [permissions, setPermissions] = useState<string[]>([])
  const [authzReady, setAuthzReady] = useState(false)

  const canAssignManager = permissions.includes(PermissionKey.USERS_ASSIGN_MANAGER)
  const canSuspend = permissions.includes(PermissionKey.USERS_SUSPEND)
  const canSetManagerRole = permissions.includes(PermissionKey.USERS_ROLE_SET_MANAGER)
  const canSetAdminRole = permissions.includes(PermissionKey.USERS_ROLE_SET_ADMIN)
  const canManageOfflineUser = permissions.includes(PermissionKey.OFFLINE_TIME_MANAGE_USER)
  const orgAdmin = isOrgAdminRole(session?.user?.role)
  const managerDemoteTarget =
    editOpen && editRow
      ? !orgAdmin &&
        session?.user?.role === 'manager' &&
        editRow.role === 'manager' &&
        editRow.manager_id === selfId
      : false

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data } = await api.get<{ authz?: { permissions?: string[] } }>('/v1/app/auth/me')
        if (!cancelled) setPermissions(data.authz?.permissions ?? [])
      } catch {
        if (!cancelled) setPermissions([])
      } finally {
        if (!cancelled) setAuthzReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadManagers = useCallback(async () => {
    try {
      const roles = ['manager', 'admin', 'super_admin'] as const
      const responses = await Promise.all(
        roles.map((role) =>
          api.get<{ users: UserRow[] }>('/v1/admin/users', {
            params: { page: 1, limit: 100, role },
          })
        )
      )
      const map = new Map<string, ManagerOption>()
      for (const { data } of responses) {
        for (const u of data.users ?? []) {
          if (MANAGER_ROLES.has(u.role) && u.status === 'active') {
            map.set(u.id, { id: u.id, name: u.name, email: u.email, role: u.role })
          }
        }
      }
      setManagerOptions([...map.values()].sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      /* non-fatal */
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(roleFilter ? { role: roleFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      })
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setErr('Could not load users.')
      setUsers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, statusFilter])

  useEffect(() => {
    if (!authzReady || !canAssignManager) {
      setManagerOptions([])
      return
    }
    void loadManagers()
  }, [authzReady, canAssignManager, loadManagers])

  useEffect(() => {
    void loadUsers()
    api
      .get<{ user_ids: string[] }>('/v1/admin/settings/override-users')
      .then(({ data }) => setOverrideUserIds(new Set(data.user_ids)))
      .catch(() => {})
  }, [loadUsers])

  const loadAssignablePool = useCallback(async (excludeUserId: string) => {
    setAssignableLoading(true)
    try {
      const collected: UserRow[] = []
      let page = 1
      let total = Infinity
      while (collected.length < total && page <= 100) {
        const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
          params: { page, limit: 100, status: 'active' },
        })
        total = data.total ?? 0
        const batch = data.users ?? []
        collected.push(...batch)
        page += 1
        if (batch.length === 0) break
      }
      const opts: DirectReportOption[] = collected
        .filter((u) => u.id !== excludeUserId && u.role !== 'super_admin')
        .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))
      opts.sort((a, b) => a.name.localeCompare(b.name))
      setAssignablePool(opts)
    } catch {
      setAssignablePool([])
    } finally {
      setAssignableLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!editOpen) {
      setAssignablePool([])
      return
    }
    if (!editRow || !orgAdmin || !canAssignManager || !authzReady) return
    void loadAssignablePool(editRow.id)
  }, [editOpen, editRow, orgAdmin, canAssignManager, authzReady, loadAssignablePool])

  useEffect(() => {
    if (!editOpen) {
      setEditReportIds([])
      setReportsLoading(false)
      return
    }
    if (!editRow || !orgAdmin || !canAssignManager || !authzReady) return
    if (editRow.role !== 'manager') {
      setEditReportIds([])
      setReportsLoading(false)
      return
    }
    let cancelled = false
    setReportsLoading(true)
    void (async () => {
      try {
        const ids: string[] = []
        let page = 1
        let total = Infinity
        while (ids.length < total && page <= 100) {
          const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
            params: { page, limit: 100, manager_id: editRow.id },
          })
          total = data.total ?? 0
          const batch = data.users ?? []
          for (const u of batch) ids.push(u.id)
          page += 1
          if (batch.length === 0) break
        }
        if (!cancelled) setEditReportIds(ids)
      } catch {
        if (!cancelled) setEditReportIds([])
      } finally {
        if (!cancelled) setReportsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editOpen, editRow, orgAdmin, canAssignManager, authzReady])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const toIdx = Math.min(page * PAGE_SIZE, total)

  function openEdit(row: UserRow) {
    if (row.role === 'super_admin' || row.id === selfId) return
    setEditRow(row)
    setEditName(row.name)
    setEditRole(row.role === 'admin' || row.role === 'manager' ? row.role : 'employee')
    setEditStatus(row.status === 'suspended' ? 'suspended' : 'active')
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editRow) return
    setEditSaving(true)
    try {
      const nameTrim = editName.trim()
      const payload: { name?: string; role?: typeof editRole; status?: typeof editStatus } = {}
      if (nameTrim !== editRow.name) {
        if (!nameTrim) {
          setErr('Display name cannot be empty.')
          setEditSaving(false)
          return
        }
        payload.name = nameTrim
      }
      if (orgAdmin) {
        if (canSetManagerRole || canSetAdminRole) {
          const rowRole =
            editRow.role === 'admin' || editRow.role === 'manager' ? editRow.role : 'employee'
          if (editRole !== rowRole) payload.role = editRole
        }
        if (canSuspend) {
          const rowActive = editRow.status !== 'suspended'
          const wantActive = editStatus === 'active'
          if (rowActive !== wantActive) payload.status = editStatus
        }
      } else if (managerDemoteTarget && editRole === 'employee' && editRow.role === 'manager') {
        payload.role = 'employee'
      }

      const syncDirectReports =
        orgAdmin && canAssignManager && editRole === 'manager' && !managerDemoteTarget

      if (Object.keys(payload).length === 0 && !syncDirectReports) {
        setEditOpen(false)
        setEditRow(null)
        return
      }

      if (Object.keys(payload).length > 0) {
        await api.patch(`/v1/admin/users/${encodeURIComponent(editRow.id)}`, payload)
      }

      if (syncDirectReports) {
        await api.put(`/v1/admin/users/${encodeURIComponent(editRow.id)}/direct-reports`, {
          user_ids: editReportIds,
        })
      }

      setEditOpen(false)
      setEditRow(null)
      await loadUsers()
    } catch (e: unknown) {
      let msg = 'Could not update user.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      setErr(msg)
    } finally {
      setEditSaving(false)
    }
  }

  async function suspendUser(row: UserRow) {
    if (row.role === 'super_admin' || row.id === selfId) return
    if (!window.confirm(`Suspend ${row.name}? They will lose access until reactivated.`)) return
    try {
      await api.delete(`/v1/admin/users/${encodeURIComponent(row.id)}`)
      await loadUsers()
    } catch (e: unknown) {
      let msg = 'Could not suspend user.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      setErr(msg)
    }
  }

  async function patchManager(userId: string, manager_id: string | null) {
    try {
      await api.patch(`/v1/users/${encodeURIComponent(userId)}/manager`, { manager_id })
      await loadUsers()
    } catch (e: unknown) {
      let msg = 'Could not update manager.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      setErr(msg)
    }
  }

  async function patchOfflinePerm(userId: string, can_add_offline_time: boolean | null) {
    try {
      await api.patch(`/v1/users/${encodeURIComponent(userId)}/permissions`, {
        can_add_offline_time,
      })
      await loadUsers()
    } catch (e: unknown) {
      let msg = 'Could not update offline permission.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      setErr(msg)
    }
  }

  const selectCls =
    'mt-1 w-full max-w-[11rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-input'

  function managersExcluding(rowId: string) {
    return managerOptions.filter((m) => m.id !== rowId)
  }

  function resetInviteForm() {
    setInviteEmail('')
    setInviteRole('employee')
    setInviteFeedback(null)
  }

  async function submitInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) {
      setInviteFeedback({ type: 'err', text: 'Enter an email address.' })
      return
    }
    setInviteSubmitting(true)
    setInviteFeedback(null)
    try {
      await api.post('/v1/public/auth/invite', { email, role: inviteRole })
      setInviteFeedback({
        type: 'ok',
        text: 'Invitation sent. They will receive an email with a signup link.',
      })
      setInviteEmail('')
      setInviteRole('employee')
      await loadUsers()
    } catch (e: unknown) {
      let msg = 'Could not send invite.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { code?: string; message?: string }
        if (d?.message) msg = d.message
      }
      setInviteFeedback({ type: 'err', text: msg })
    } finally {
      setInviteSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/40 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="team_search">Search</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="team_search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (setSearch(searchInput), setPage(1))}
                placeholder="Name or email"
              />
              <Button type="button" onClick={() => (setSearch(searchInput), setPage(1))}>
                Go
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="role_f">Role</Label>
            <select
              id="role_f"
              className={cn(selectCls, 'mt-1 block')}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <Label htmlFor="status_f">Status</Label>
            <select
              id="status_f"
              className={cn(selectCls, 'mt-1 block')}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="invited">Invited</option>
            </select>
          </div>
        </div>
        {orgAdmin ? (
          <Button type="button" className="shrink-0" onClick={() => setInviteOpen(true)}>
            Invite user
          </Button>
        ) : null}
      </div>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open)
          if (!open) resetInviteForm()
        }}
      >
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              Send an email invitation. They will set their name and password when they accept.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label htmlFor="invite_email">Email</Label>
              <Input
                id="invite_email"
                type="email"
                className="mt-1"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="invite_role">Role when they join</Label>
              <select
                id="invite_role"
                className={cn(selectCls, 'mt-1 block max-w-none')}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'employee' | 'manager' | 'admin')}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {inviteFeedback ? (
              <p
                className={
                  inviteFeedback.type === 'ok'
                    ? 'text-sm text-emerald-600 dark:text-emerald-400'
                    : 'text-sm text-destructive'
                }
              >
                {inviteFeedback.text}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setInviteOpen(false)
                resetInviteForm()
              }}
            >
              Close
            </Button>
            <Button type="button" loading={inviteSubmitting} onClick={() => void submitInvite()}>
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Manager</th>
              <th className="px-3 py-2 font-medium">Offline time</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          {loading ? (
            <TeamTableSkeleton />
          ) : users.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No users match.
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {users.map((row) => {
                const locked = row.role === 'super_admin' || row.id === selfId
                const mgrChoices = managersExcluding(row.id)
                const managerEditable = canAssignManager && !locked && authzReady
                return (
                  <tr key={row.id} className="border-b border-border/80">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.name} size="sm" />
                        <span className="font-medium text-foreground">{row.name}</span>
                        {overrideUserIds.has(row.id) && (
                          <span className="rounded px-1.5 text-xs bg-brand-secondary/10 text-brand-secondary">
                            override
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.email}</td>
                    <td className="px-3 py-2">
                      <Badge variant={roleBadgeVariant(row.role)} className="font-normal">
                        {roleLabel(row.role)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={statusBadgeVariant(row.status)}
                        className="font-normal capitalize"
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {managerEditable ? (
                        <select
                          className={selectCls}
                          value={row.manager_id ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            void patchManager(row.id, v === '' ? null : v)
                          }}
                        >
                          <option value="">— None —</option>
                          {mgrChoices.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({roleLabel(m.role)})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-foreground">
                          {row.manager?.name?.trim() ? row.manager.name : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={selectCls}
                        disabled={locked || !canManageOfflineUser || !authzReady}
                        value={
                          row.can_add_offline_time === null ||
                          row.can_add_offline_time === undefined
                            ? ''
                            : row.can_add_offline_time
                              ? 'yes'
                              : 'no'
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          void patchOfflinePerm(
                            row.id,
                            v === '' ? null : v === 'yes' ? true : false
                          )
                        }}
                      >
                        <option value="">Inherit org default</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={locked}
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            locked || row.status === 'suspended' || !canSuspend || !authzReady
                          }
                          onClick={() => void suspendUser(row)}
                        >
                          Suspend
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )}
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums text-foreground/90">
            {fromIdx}–{toIdx}
          </span>
          <span> of </span>
          <span className="tabular-nums text-foreground/90">{total}</span>
          <span> users</span>
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={editOpen && Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) {
            setEditOpen(false)
            setEditRow(null)
          }
        }}
      >
        {editRow ? (
          <DialogContent
            className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              const el = e.target as HTMLElement
              if (el.closest('[data-radix-popper-content-wrapper]')) e.preventDefault()
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>{editRow.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-1">
              <fieldset className="space-y-3">
                <legend className="sr-only">Profile</legend>
                <div>
                  <Label htmlFor="edit_name">Display name</Label>
                  <Input
                    id="edit_name"
                    className="mt-1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </fieldset>
              {managerDemoteTarget ? (
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Role
                  </legend>
                  <div>
                    <Label htmlFor="edit_role_demote">Role</Label>
                    <select
                      id="edit_role_demote"
                      className={cn(selectCls, 'mt-1 block max-w-none')}
                      value={editRole}
                      onChange={(e) =>
                        setEditRole(e.target.value as 'employee' | 'manager' | 'admin')
                      }
                    >
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                  </div>
                </fieldset>
              ) : null}
              {orgAdmin && (canSetManagerRole || canSetAdminRole || canSuspend) ? (
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Access
                  </legend>
                  {(canSetManagerRole || canSetAdminRole) && (
                    <div>
                      <Label htmlFor="edit_role">Role</Label>
                      <select
                        id="edit_role"
                        className={cn(selectCls, 'mt-1 block max-w-none')}
                        value={editRole}
                        onChange={(e) =>
                          setEditRole(e.target.value as 'employee' | 'manager' | 'admin')
                        }
                      >
                        <option value="employee">Employee</option>
                        {canSetManagerRole || editRow.role === 'manager' ? (
                          <option value="manager">Manager</option>
                        ) : null}
                        {canSetAdminRole || editRow.role === 'admin' ? (
                          <option value="admin">Admin</option>
                        ) : null}
                      </select>
                    </div>
                  )}
                  {canSuspend ? (
                    <div>
                      <Label htmlFor="edit_status">Status</Label>
                      <select
                        id="edit_status"
                        className={cn(selectCls, 'mt-1 block max-w-none')}
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              {orgAdmin && canAssignManager && editRole === 'manager' && !managerDemoteTarget ? (
                <fieldset className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Direct reports
                  </legend>
                  <p className="text-sm text-muted-foreground">
                    Choose who reports to this person. Saving updates their line manager to match
                    your selection.
                  </p>
                  {assignableLoading || reportsLoading ? (
                    <div className="space-y-2 py-2">
                      <Skeleton className="h-10 w-full rounded-lg" />
                      <Skeleton className="h-16 w-full rounded-lg" />
                    </div>
                  ) : (
                    <DirectReportsMultiSelect
                      options={assignablePool}
                      value={editReportIds}
                      onChange={setEditReportIds}
                      disabled={editSaving}
                    />
                  )}
                </fieldset>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditOpen(false)
                  setEditRow(null)
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEdit()} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
