'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { InitialsAvatar as Avatar } from '@/components/ui/initials-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
import {
  canManageExistingInviteForRole,
  defaultInviteRoleForOrgRole,
  getInviteRoleOptionsForOrgRole,
  isOrgAdminOnly,
  isOrgAdminRole,
  normalizeOrgRole,
  orgMemberRoleDisplayLabel,
  PermissionKey,
  type InviteRoleOption,
} from '@/lib/roles'
import {
  DirectReportsMultiSelect,
  type DirectReportOption,
} from '@/components/DirectReportsMultiSelect'
import { LineManagerCombobox } from '@/components/LineManagerCombobox'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at: string
  manager_id: string | null
  can_add_offline_time: boolean | null
  manager: { id: string; name: string; email: string } | null
}

type ManagerOption = { id: string; name: string; email: string; role: string }

type TeamMemberRow = {
  id: string
  team_id: string
  user_id: string
  team_role: string
  user: { id: string; name: string; email: string; role: string }
}

type TeamRow = {
  id: string
  name: string
  manager_id: string | null
  manager: { id: string; name: string; email: string } | null
  members: TeamMemberRow[]
}

type InviteRow = {
  id: string
  email: string
  role: string
  first_name?: string
  last_name?: string
  manager_id?: string | null
  line_manager?: { id: string; name: string; email: string } | null
  accepted_at: string | null
  expires_at: string
  created_at: string
  status: 'pending' | 'accepted' | 'expired'
  invited_by: { id: string; name: string; email: string } | null
}

function inviteRowDisplayName(inv: InviteRow): string {
  const f = (inv.first_name ?? '').trim()
  const l = (inv.last_name ?? '').trim()
  const joined = [f, l].filter(Boolean).join(' ')
  return joined || '—'
}

const MANAGER_ROLES = new Set(['manager', 'admin', 'super_admin'])
const PAGE_SIZE = 25

/** Prisma enums from `/v1/admin/users` → lowercase UI roles */
function normalizeApiUserRole(role: string | undefined): string {
  if (role == null || role === '') return 'employee'
  const key = role.toUpperCase()
  const map: Record<string, string> = {
    OWNER: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    EMPLOYEE: 'employee',
    VIEWER: 'viewer',
  }
  return map[key] ?? role.toLowerCase()
}

function normalizeApiUserStatus(status: string | undefined): string {
  if (status == null || status === '') return 'active'
  return status.toLowerCase()
}

function normalizeUserRow(u: UserRow): UserRow {
  return {
    ...u,
    role: normalizeApiUserRole(u.role),
    status: normalizeApiUserStatus(u.status),
  }
}

function normalizeTeamRow(t: TeamRow): TeamRow {
  return {
    ...t,
    members: (t.members ?? []).map((m) => ({
      ...m,
      user: {
        ...m.user,
        role: normalizeApiUserRole(m.user.role),
      },
    })),
  }
}

function editRoleToApi(r: 'employee' | 'manager' | 'admin'): 'EMPLOYEE' | 'MANAGER' | 'ADMIN' {
  if (r === 'admin') return 'ADMIN'
  if (r === 'manager') return 'MANAGER'
  return 'EMPLOYEE'
}

function editStatusToApi(s: 'active' | 'suspended'): 'ACTIVE' | 'SUSPENDED' {
  return s === 'suspended' ? 'SUSPENDED' : 'ACTIVE'
}

function inviteRoleToApi(r: InviteRoleOption): 'EMPLOYEE' | 'MANAGER' | 'ADMIN' | 'VIEWER' {
  if (r === 'admin') return 'ADMIN'
  if (r === 'manager') return 'MANAGER'
  if (r === 'viewer') return 'VIEWER'
  return 'EMPLOYEE'
}

function roleBadgeVariant(role: string): 'indigo' | 'violet' | 'secondary' | 'warning' {
  switch (role) {
    case 'admin':
    case 'super_admin':
      return 'indigo'
    case 'manager':
      return 'violet'
    case 'viewer':
      return 'secondary'
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

function inviteStatusBadgeVariant(
  status: 'pending' | 'accepted' | 'expired'
): 'warning' | 'emerald' | 'secondary' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'accepted':
      return 'emerald'
    case 'expired':
    default:
      return 'secondary'
  }
}

function formatInviteDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const selectCls =
  'mt-1 w-full max-w-[11rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-input'

function MembersCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function OrganizationPeopleClient() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const selfId = session?.user?.id ?? ''

  const rawRole = session?.user?.role as string | undefined
  const role = normalizeOrgRole(rawRole)
  const orgAdmin = isOrgAdminRole(role)
  const showTeamsTab = isOrgAdminOnly(role)
  const canInvite = orgAdmin || role === 'manager'

  const tabParam = searchParams?.get('tab') ?? null
  const tab: 'members' | 'teams' | 'invitations' =
    showTeamsTab && tabParam === 'teams'
      ? 'teams'
      : canInvite && tabParam === 'invitations'
        ? 'invitations'
        : 'members'

  useEffect(() => {
    if (!showTeamsTab && tabParam === 'teams') {
      router.replace('/myhome/organization/people')
    }
    if (!canInvite && tabParam === 'invitations') {
      router.replace('/myhome/organization/people')
    }
  }, [showTeamsTab, canInvite, tabParam, router])

  function setTab(next: 'members' | 'teams' | 'invitations') {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'members') params.delete('tab')
    else params.set('tab', next)
    const q = params.toString()
    router.replace(q ? `/myhome/organization/people?${q}` : '/myhome/organization/people')
  }

  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([])
  const [managersLoading, setManagersLoading] = useState(false)
  const [overrideUserIds, setOverrideUserIds] = useState<Set<string>>(new Set())

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRoleOption>('employee')
  const [inviteManagerId, setInviteManagerId] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteSuccessEmail, setInviteSuccessEmail] = useState<string | null>(null)
  const inviteEmailInputRef = useRef<HTMLInputElement>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<UserRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'employee' | 'manager' | 'admin'>('employee')
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active')
  const [editManagerId, setEditManagerId] = useState<string>('')
  const [editOffline, setEditOffline] = useState<'' | 'yes' | 'no'>('')
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
  const managerDemoteTarget =
    editOpen && editRow
      ? !orgAdmin &&
        role === 'manager' &&
        editRow.role === 'manager' &&
        editRow.manager_id === selfId
      : false

  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamDetail, setTeamDetail] = useState<TeamRow | null>(null)
  const [teamDetailLoading, setTeamDetailLoading] = useState(false)
  const [suspendConfirmUser, setSuspendConfirmUser] = useState<UserRow | null>(null)
  const [teamPendingDelete, setTeamPendingDelete] = useState<TeamRow | null>(null)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamManagerId, setNewTeamManagerId] = useState<string>('')
  const [createTeamSubmitting, setCreateTeamSubmitting] = useState(false)
  const [detailName, setDetailName] = useState('')
  const [detailManagerId, setDetailManagerId] = useState<string>('')
  const [detailSaving, setDetailSaving] = useState(false)
  const [addMemberId, setAddMemberId] = useState<string>('')
  const [orgUserOptions, setOrgUserOptions] = useState<DirectReportOption[]>([])
  const [orgUsersLoading, setOrgUsersLoading] = useState(false)

  const [invites, setInvites] = useState<InviteRow[]>([])
  const [invitesTotal, setInvitesTotal] = useState(0)
  const [invitesPage, setInvitesPage] = useState(1)
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [invitesStatusFilter, setInvitesStatusFilter] = useState<
    '' | 'pending' | 'accepted' | 'expired'
  >('')
  const [invitesSearch, setInvitesSearch] = useState('')
  const [invitesSearchInput, setInvitesSearchInput] = useState('')
  const [revokeConfirmInvite, setRevokeConfirmInvite] = useState<InviteRow | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

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

  useEffect(() => {
    const opts = getInviteRoleOptionsForOrgRole(role)
    if (opts.length === 0) return
    setInviteRole((prev) => (opts.includes(prev) ? prev : (opts[0] ?? 'employee')))
  }, [role])

  useEffect(() => {
    if (inviteRole !== 'employee') {
      setInviteManagerId('')
      return
    }
    setInviteManagerId((prev) => {
      if (prev && managerOptions.some((m) => m.id === prev)) return prev
      if (selfId && managerOptions.some((m) => m.id === selfId)) return selfId
      return managerOptions[0]?.id ?? ''
    })
  }, [inviteRole, selfId, managerOptions])

  const loadManagers = useCallback(async () => {
    setManagersLoading(true)
    try {
      const roles = ['MANAGER', 'ADMIN', 'OWNER'] as const
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
          const nr = normalizeApiUserRole(u.role)
          const ns = normalizeApiUserStatus(u.status)
          if (MANAGER_ROLES.has(nr) && ns === 'active') {
            map.set(u.id, { id: u.id, name: u.name, email: u.email, role: nr })
          }
        }
      }
      setManagerOptions([...map.values()].sort((a, b) => a.email.localeCompare(b.email)))
    } catch {
      /* non-fatal */
    } finally {
      setManagersLoading(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const roleApi =
        roleFilter === 'employee'
          ? 'EMPLOYEE'
          : roleFilter === 'manager'
            ? 'MANAGER'
            : roleFilter === 'admin'
              ? 'ADMIN'
              : undefined
      const statusApi =
        statusFilter === 'active'
          ? 'ACTIVE'
          : statusFilter === 'suspended'
            ? 'SUSPENDED'
            : undefined
      const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(roleApi ? { role: roleApi } : {}),
          ...(statusApi ? { status: statusApi } : {}),
        },
      })
      setUsers((data.users ?? []).map(normalizeUserRow))
      setTotal(data.total ?? 0)
    } catch {
      adminToast.error('Could not load users.')
      setUsers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, statusFilter])

  useEffect(() => {
    if (!authzReady) return
    if (!canAssignManager && !showTeamsTab && !canInvite) {
      setManagerOptions([])
      return
    }
    void loadManagers()
  }, [authzReady, canAssignManager, showTeamsTab, canInvite, loadManagers])

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
      let p = 1
      let tot = Infinity
      while (collected.length < tot && p <= 100) {
        const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
          params: { page: p, limit: 100, status: 'ACTIVE' },
        })
        tot = data.total ?? 0
        const batch = data.users ?? []
        collected.push(...batch)
        p += 1
        if (batch.length === 0) break
      }
      const opts: DirectReportOption[] = collected
        .map(normalizeUserRow)
        .filter((u) => u.id !== excludeUserId && u.role !== 'super_admin')
        .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))
      opts.sort((a, b) => a.email.localeCompare(b.email))
      setAssignablePool(opts)
    } catch {
      setAssignablePool([])
    } finally {
      setAssignableLoading(false)
    }
  }, [])

  const loadOrgUsersForTeam = useCallback(async (memberIds: Set<string>) => {
    setOrgUsersLoading(true)
    try {
      const collected: UserRow[] = []
      let p = 1
      let tot = Infinity
      while (collected.length < tot && p <= 100) {
        const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
          params: { page: p, limit: 100, status: 'ACTIVE' },
        })
        tot = data.total ?? 0
        const batch = data.users ?? []
        collected.push(...batch)
        p += 1
        if (batch.length === 0) break
      }
      const opts: DirectReportOption[] = collected
        .map(normalizeUserRow)
        .filter((u) => !memberIds.has(u.id) && u.role !== 'super_admin')
        .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))
      opts.sort((a, b) => a.email.localeCompare(b.email))
      setOrgUserOptions(opts)
    } catch {
      setOrgUserOptions([])
    } finally {
      setOrgUsersLoading(false)
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
        let p = 1
        let tot = Infinity
        while (ids.length < tot && p <= 100) {
          const { data } = await api.get<{ users: UserRow[]; total: number }>('/v1/admin/users', {
            params: { page: p, limit: 100, manager_id: editRow.id },
          })
          tot = data.total ?? 0
          const batch = data.users ?? []
          for (const u of batch) ids.push(u.id)
          p += 1
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

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true)
    try {
      const { data } = await api.get<{ teams: TeamRow[] }>('/v1/teams')
      setTeams((data.teams ?? []).map(normalizeTeamRow))
    } catch {
      adminToast.error('Could not load teams.')
      setTeams([])
    } finally {
      setTeamsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showTeamsTab) void loadTeams()
  }, [showTeamsTab, loadTeams])

  useEffect(() => {
    if (!teamDetail || !showTeamsTab) {
      setOrgUserOptions([])
      return
    }
    const memberIds = new Set(teamDetail.members.map((m) => m.user_id))
    void loadOrgUsersForTeam(memberIds)
  }, [teamDetail, showTeamsTab, loadOrgUsersForTeam])

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true)
    try {
      const { data } = await api.get<{ invites: InviteRow[]; total: number }>('/v1/admin/invites', {
        params: {
          page: invitesPage,
          limit: 25,
          ...(invitesSearch.trim() ? { search: invitesSearch.trim() } : {}),
          ...(invitesStatusFilter ? { status: invitesStatusFilter } : {}),
        },
      })
      setInvites(data.invites ?? [])
      setInvitesTotal(data.total ?? 0)
    } catch {
      adminToast.error('Could not load invitations.')
      setInvites([])
      setInvitesTotal(0)
    } finally {
      setInvitesLoading(false)
    }
  }, [invitesPage, invitesSearch, invitesStatusFilter])

  useEffect(() => {
    if (tab === 'invitations' && canInvite) void loadInvites()
  }, [tab, canInvite, loadInvites])

  async function revokeInvite(invite: InviteRow) {
    setRevokingId(invite.id)
    try {
      await api.delete(`/v1/admin/invites/${encodeURIComponent(invite.id)}`)
      await loadInvites()
      adminToast.success('Invite revoked')
    } catch (e: unknown) {
      let msg = 'Could not revoke invite.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    } finally {
      setRevokingId(null)
      setRevokeConfirmInvite(null)
    }
  }

  async function resendInvite(invite: InviteRow) {
    setResendingId(invite.id)
    try {
      await api.post(`/v1/admin/invites/${encodeURIComponent(invite.id)}/resend`)
      await loadInvites()
      adminToast.success('Invite resent')
    } catch (e: unknown) {
      let msg = 'Could not resend invite.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    } finally {
      setResendingId(null)
    }
  }

  useEffect(() => {
    if (teamDetail) {
      setDetailName(teamDetail.name)
      setDetailManagerId(teamDetail.manager_id ?? '')
    }
  }, [teamDetail])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const toIdx = Math.min(page * PAGE_SIZE, total)

  function managersExcluding(rowId: string) {
    return managerOptions.filter((m) => m.id !== rowId)
  }

  function openEdit(row: UserRow) {
    if (row.role === 'super_admin' || row.id === selfId) return
    setEditRow(row)
    setEditName(row.name)
    setEditRole(row.role === 'admin' || row.role === 'manager' ? row.role : 'employee')
    setEditStatus(row.status === 'suspended' ? 'suspended' : 'active')
    setEditManagerId(row.manager_id ?? '')
    setEditOffline(
      row.can_add_offline_time === null || row.can_add_offline_time === undefined
        ? ''
        : row.can_add_offline_time
          ? 'yes'
          : 'no'
    )
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editRow) return
    setEditSaving(true)
    try {
      const nameTrim = editName.trim()
      const payload: {
        name?: string
        role?: 'EMPLOYEE' | 'MANAGER' | 'ADMIN'
        status?: 'ACTIVE' | 'SUSPENDED'
      } = {}
      if (nameTrim !== editRow.name) {
        if (!nameTrim) {
          adminToast.error('Display name cannot be empty.')
          setEditSaving(false)
          return
        }
        payload.name = nameTrim
      }
      if (orgAdmin) {
        if (canSetManagerRole || canSetAdminRole) {
          const rowRole =
            editRow.role === 'admin' || editRow.role === 'manager' ? editRow.role : 'employee'
          if (editRole !== rowRole) payload.role = editRoleToApi(editRole)
        }
        if (canSuspend) {
          const rowActive = editRow.status !== 'suspended'
          const wantActive = editStatus === 'active'
          if (rowActive !== wantActive) payload.status = editStatusToApi(editStatus)
        }
      } else if (managerDemoteTarget && editRole === 'employee' && editRow.role === 'manager') {
        payload.role = 'EMPLOYEE'
      }

      const syncDirectReports =
        orgAdmin && canAssignManager && editRole === 'manager' && !managerDemoteTarget

      const rowLocked = editRow.role === 'super_admin' || editRow.id === selfId
      const managerEditable = canAssignManager && !rowLocked && authzReady

      const mgrChoicesForSave = managersExcluding(editRow.id)
      let wantManagerId: string | null = null
      if (managerEditable) {
        if (editRole === 'admin') {
          wantManagerId = editManagerId === '' ? null : editManagerId
        } else {
          if (editRole === 'employee' || editRole === 'manager') {
            if (mgrChoicesForSave.length === 0) {
              adminToast.error('No eligible line managers are available in this organization.')
              setEditSaving(false)
              return
            }
            wantManagerId = editManagerId || mgrChoicesForSave[0].id
            if (!wantManagerId) {
              adminToast.error('Employees and managers must report to a line manager.')
              setEditSaving(false)
              return
            }
          }
        }
      }

      let managerChanged = false
      if (managerEditable) {
        const have = editRow.manager_id
        if (wantManagerId !== have) managerChanged = true
      }

      let offlineChanged = false
      if (!rowLocked && canManageOfflineUser && authzReady) {
        const want =
          editOffline === ''
            ? null
            : editOffline === 'yes'
              ? true
              : editOffline === 'no'
                ? false
                : null
        const have = editRow.can_add_offline_time
        const normHave =
          have === null || have === undefined
            ? null
            : have === true
              ? true
              : have === false
                ? false
                : null
        if (want !== normHave) offlineChanged = true
      }

      if (
        Object.keys(payload).length === 0 &&
        !syncDirectReports &&
        !managerChanged &&
        !offlineChanged
      ) {
        setEditOpen(false)
        setEditRow(null)
        return
      }

      if (Object.keys(payload).length > 0) {
        await api.patch(`/v1/admin/users/${encodeURIComponent(editRow.id)}`, payload)
      }

      if (managerChanged && managerEditable) {
        await api.patch(`/v1/users/${encodeURIComponent(editRow.id)}/manager`, {
          manager_id: wantManagerId,
        })
      }

      if (offlineChanged && canManageOfflineUser) {
        await api.patch(`/v1/users/${encodeURIComponent(editRow.id)}/permissions`, {
          can_add_offline_time:
            editOffline === ''
              ? null
              : editOffline === 'yes'
                ? true
                : editOffline === 'no'
                  ? false
                  : null,
        })
      }

      if (syncDirectReports) {
        await api.put(`/v1/admin/users/${encodeURIComponent(editRow.id)}/direct-reports`, {
          user_ids: editReportIds,
        })
      }

      setEditOpen(false)
      setEditRow(null)
      await loadUsers()
      adminToast.success('User updated')
    } catch (e: unknown) {
      let msg = 'Could not update user.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    } finally {
      setEditSaving(false)
    }
  }

  function requestSuspendUser(row: UserRow) {
    if (row.role === 'super_admin' || row.id === selfId) return
    setSuspendConfirmUser(row)
  }

  async function executeSuspendUser(row: UserRow) {
    try {
      await api.delete(`/v1/admin/users/${encodeURIComponent(row.id)}`)
      await loadUsers()
      adminToast.success('User suspended')
    } catch (e: unknown) {
      let msg = 'Could not suspend user.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    }
  }

  function resetInviteForm() {
    setInviteEmail('')
    setInviteFirstName('')
    setInviteLastName('')
    setInviteRole(defaultInviteRoleForOrgRole(role))
    setInviteManagerId('')
    setInviteSuccessEmail(null)
  }

  async function submitInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) {
      adminToast.error('Enter an email address.')
      return
    }
    const firstName = inviteFirstName.trim()
    const lastName = inviteLastName.trim()
    if (!firstName || !lastName) {
      adminToast.error('Enter first name and last name for the person you are inviting.')
      return
    }
    if (inviteRole === 'employee') {
      if (!inviteManagerId) {
        adminToast.error('Choose who this employee reports to.')
        return
      }
    }
    setInviteSubmitting(true)
    try {
      await api.post('/v1/public/auth/invite', {
        email,
        role: inviteRoleToApi(inviteRole),
        first_name: firstName,
        last_name: lastName,
        ...(inviteRole === 'employee' && inviteManagerId ? { manager_id: inviteManagerId } : {}),
      })
      adminToast.success('Invitation sent', `They will receive an email at ${email}.`)
      setInviteSuccessEmail(email)
      setInviteEmail('')
      setInviteFirstName('')
      setInviteLastName('')
      await loadUsers()
      if (tab === 'invitations') await loadInvites()
      requestAnimationFrame(() => inviteEmailInputRef.current?.focus())
    } catch (e: unknown) {
      let msg = 'Could not send invite.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { code?: string; message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    } finally {
      setInviteSubmitting(false)
    }
  }

  async function submitCreateTeam() {
    const name = newTeamName.trim()
    if (!name) return
    setCreateTeamSubmitting(true)
    try {
      await api.post('/v1/teams', {
        name,
        ...(newTeamManagerId ? { manager_id: newTeamManagerId } : {}),
      })
      setCreateTeamOpen(false)
      setNewTeamName('')
      setNewTeamManagerId('')
      await loadTeams()
      adminToast.success('Team created')
    } catch (e: unknown) {
      let msg = 'Could not create team.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    } finally {
      setCreateTeamSubmitting(false)
    }
  }

  async function saveTeamDetail() {
    if (!teamDetail) return
    const name = detailName.trim()
    if (!name) return
    setDetailSaving(true)
    try {
      await api.patch(`/v1/teams/${encodeURIComponent(teamDetail.id)}`, {
        name,
        manager_id: detailManagerId === '' ? null : detailManagerId,
      })
      await loadTeams()
      const { data } = await api.get<{ team: TeamRow }>(
        `/v1/teams/${encodeURIComponent(teamDetail.id)}`
      )
      setTeamDetail(normalizeTeamRow(data.team))
      adminToast.success('Team updated')
    } catch (e: unknown) {
      let msg = 'Could not update team.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    } finally {
      setDetailSaving(false)
    }
  }

  function requestDeleteTeam(t: TeamRow) {
    setTeamPendingDelete(t)
  }

  async function executeDeleteTeam() {
    const target = teamPendingDelete
    if (!target) return
    try {
      await api.delete(`/v1/teams/${encodeURIComponent(target.id)}`)
      if (teamDetail?.id === target.id) setTeamDetail(null)
      setTeamPendingDelete(null)
      await loadTeams()
      adminToast.success('Team deleted')
    } catch (e: unknown) {
      let msg = 'Could not delete team.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    }
  }

  async function addTeamMember() {
    if (!teamDetail || !addMemberId) return
    try {
      await api.post(`/v1/teams/${encodeURIComponent(teamDetail.id)}/members`, {
        user_id: addMemberId,
        team_role: 'MEMBER',
      })
      setAddMemberId('')
      await loadTeams()
      const { data } = await api.get<{ team: TeamRow }>(
        `/v1/teams/${encodeURIComponent(teamDetail.id)}`
      )
      setTeamDetail(normalizeTeamRow(data.team))
      adminToast.success('Member added')
    } catch (e: unknown) {
      let msg = 'Could not add member.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    }
  }

  async function removeTeamMember(userId: string) {
    if (!teamDetail) return
    try {
      await api.delete(
        `/v1/teams/${encodeURIComponent(teamDetail.id)}/members/${encodeURIComponent(userId)}`
      )
      await loadTeams()
      const { data } = await api.get<{ team: TeamRow }>(
        `/v1/teams/${encodeURIComponent(teamDetail.id)}`
      )
      setTeamDetail(normalizeTeamRow(data.team))
      adminToast.success('Member removed')
    } catch (e: unknown) {
      let msg = 'Could not remove member.'
      if (isAxiosError(e)) {
        const d = e.response?.data as { message?: string }
        if (d?.message) msg = d.message
      }
      adminToast.error(msg)
    }
  }

  async function openTeamDetail(t: TeamRow) {
    setTeamDetail(t)
    setAddMemberId('')
    setTeamDetailLoading(true)
    try {
      const { data } = await api.get<{ team: TeamRow }>(`/v1/teams/${encodeURIComponent(t.id)}`)
      setTeamDetail(normalizeTeamRow(data.team))
    } catch {
      adminToast.error('Could not load team.')
      setTeamDetail(null)
    } finally {
      setTeamDetailLoading(false)
    }
  }

  const locked = (row: UserRow) => row.role === 'super_admin' || row.id === selfId

  const editMgrChoices = editRow ? managersExcluding(editRow.id) : []
  const lineManagerSelectValue =
    editRole === 'admin' ? editManagerId : editManagerId || editMgrChoices[0]?.id || ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => setTab('members')}
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium transition-colors',
            tab === 'members'
              ? 'bg-brand-primary/10 text-brand-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          Members
          <span className="ml-1.5 tabular-nums text-xs opacity-80">({total})</span>
        </button>
        {showTeamsTab ? (
          <button
            type="button"
            onClick={() => setTab('teams')}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === 'teams'
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            Teams
            <span className="ml-1.5 tabular-nums text-xs opacity-80">({teams.length})</span>
          </button>
        ) : null}
        {canInvite ? (
          <button
            type="button"
            onClick={() => setTab('invitations')}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === 'invitations'
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            Invitations
            {invitesTotal > 0 ? (
              <span className="ml-1.5 tabular-nums text-xs opacity-80">({invitesTotal})</span>
            ) : null}
          </button>
        ) : null}
      </div>

      {tab === 'members' ? (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/40 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[12rem] flex-1">
                <Label htmlFor="people_search">Search</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="people_search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (setSearch(searchInput), setPage(1))}
                    placeholder="Email or name"
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
                </select>
              </div>
            </div>
            {canInvite ? (
              <Button type="button" className="shrink-0" onClick={() => setInviteOpen(true)}>
                Invite user
              </Button>
            ) : null}
          </div>

          {loading ? (
            <MembersCardsSkeleton />
          ) : users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
              <p className="font-medium text-foreground">No people match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting search or filters, or invite someone new.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {users.map((row) => {
                const isLocked = locked(row)
                return (
                  <Card key={row.id} className="flex flex-col overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <Avatar name={row.email} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="truncate text-base font-medium">
                              {row.email}
                            </CardTitle>
                            {overrideUserIds.has(row.id) && (
                              <span className="rounded px-1.5 text-[10px] font-medium uppercase tracking-wide bg-brand-secondary/10 text-brand-secondary">
                                override
                              </span>
                            )}
                          </div>
                          <CardDescription className="truncate text-xs">
                            {row.name?.trim() ? row.name : 'No display name'}
                          </CardDescription>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant={roleBadgeVariant(row.role)} className="font-normal">
                              {orgMemberRoleDisplayLabel(row.role)}
                            </Badge>
                            <Badge
                              variant={statusBadgeVariant(row.status)}
                              className="font-normal capitalize"
                            >
                              {row.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-1 flex-col gap-3 border-t border-border/60 pt-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Manager: </span>
                        <span className="break-all text-foreground">
                          {row.manager?.email?.trim()
                            ? row.manager.email
                            : row.manager?.name?.trim()
                              ? row.manager.name
                              : '—'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isLocked}
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            isLocked || row.status === 'suspended' || !canSuspend || !authzReady
                          }
                          onClick={() => requestSuspendUser(row)}
                        >
                          Suspend
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {pageCount > 1 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="tabular-nums text-foreground/90">
                  {fromIdx}–{toIdx}
                </span>
                <span> of </span>
                <span className="tabular-nums text-foreground/90">{total}</span>
                <span> people</span>
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
          ) : null}
        </>
      ) : tab === 'teams' ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Groups for projects and reporting. Line managers are managed on the Members tab.
            </p>
            {showTeamsTab ? (
              <Button type="button" onClick={() => setCreateTeamOpen(true)}>
                New team
              </Button>
            ) : null}
          </div>

          {teamsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
              <p className="font-medium text-foreground">No teams yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a team to organize people for projects and reporting.
              </p>
              {showTeamsTab ? (
                <Button className="mt-4" type="button" onClick={() => setCreateTeamOpen(true)}>
                  Create your first team
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="relative rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:border-brand-primary/40"
                >
                  <button
                    type="button"
                    onClick={() => void openTeamDetail(t)}
                    className="w-full rounded-xl p-5 text-left hover:bg-muted/20"
                  >
                    <p className="pr-16 font-semibold text-foreground">{t.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.manager?.email?.trim()
                        ? `Lead: ${t.manager.email}`
                        : t.manager?.name?.trim()
                          ? `Lead: ${t.manager.name}`
                          : 'No team lead'}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <div className="flex -space-x-2">
                        {t.members.slice(0, 5).map((m) => (
                          <Avatar
                            key={m.user_id}
                            name={m.user.email}
                            size="sm"
                            className="ring-2 ring-card"
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {t.members.length} member{t.members.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </button>
                  {showTeamsTab ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        requestDeleteTeam(t)
                      }}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New team</DialogTitle>
                <DialogDescription>
                  Add a named group. You can assign a team lead and members next.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div>
                  <Label htmlFor="new_team_name">Team name</Label>
                  <Input
                    id="new_team_name"
                    className="mt-1"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. Product design"
                  />
                </div>
                <div>
                  <Label htmlFor="new_team_mgr">Team lead (optional)</Label>
                  <select
                    id="new_team_mgr"
                    className={cn(selectCls, 'mt-1 block max-w-none')}
                    value={newTeamManagerId}
                    onChange={(e) => setNewTeamManagerId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.email} · {m.name} ({orgMemberRoleDisplayLabel(m.role)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateTeamOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  loading={createTeamSubmitting}
                  onClick={() => void submitCreateTeam()}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(teamDetail)}
            onOpenChange={(open) => {
              if (!open) {
                setTeamDetail(null)
                setTeamDetailLoading(false)
              }
            }}
          >
            {teamDetail ? (
              <DialogContent className="flex max-h-[min(92vh,880px)] w-[min(100vw-1.25rem,56rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
                {/* Inner wrapper is `relative` so the loading overlay positions correctly.
                    Do not put `relative` on DialogContent — it overrides `fixed` and breaks centering. */}
                <div className="relative flex min-h-0 flex-1 flex-col">
                  {teamDetailLoading ? (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-sm"
                      aria-busy
                      aria-label="Loading team"
                    >
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-brand-primary" />
                      <p className="text-sm text-muted-foreground">Loading team…</p>
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      'shrink-0 border-b border-border bg-muted/20 px-6 py-5 sm:px-8',
                      teamDetailLoading && 'pointer-events-none opacity-50'
                    )}
                  >
                    <DialogHeader className="space-y-1 text-left">
                      <DialogTitle className="text-xl sm:text-2xl">{teamDetail.name}</DialogTitle>
                      <DialogDescription className="text-base">
                        Edit team details and membership. People are listed by work email.
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                  <div
                    className={cn(
                      'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6 sm:px-8 lg:overflow-y-auto',
                      teamDetailLoading && 'pointer-events-none opacity-50'
                    )}
                  >
                    <div className="grid min-h-0 gap-8 lg:grid-cols-2 lg:items-start lg:gap-8">
                      <section
                        aria-labelledby="team-details-heading"
                        className="h-fit space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:max-w-none"
                      >
                        <h3
                          id="team-details-heading"
                          className="text-sm font-semibold text-foreground"
                        >
                          Team details
                        </h3>
                        <div>
                          <Label htmlFor="detail_name">Name</Label>
                          <Input
                            id="detail_name"
                            className="mt-1.5 h-10"
                            value={detailName}
                            onChange={(e) => setDetailName(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="detail_mgr">Team lead</Label>
                          <select
                            id="detail_mgr"
                            className={cn(selectCls, 'mt-1.5 block h-10 w-full max-w-none py-2')}
                            value={detailManagerId}
                            onChange={(e) => setDetailManagerId(e.target.value)}
                          >
                            <option value="">— None —</option>
                            {managerOptions.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.email} · {m.name} ({orgMemberRoleDisplayLabel(m.role)})
                              </option>
                            ))}
                          </select>
                        </div>
                      </section>

                      <section
                        aria-labelledby="team-members-heading"
                        className="flex min-h-0 max-h-[min(70vh,640px)] flex-col rounded-xl border border-border bg-card p-5 shadow-sm lg:max-h-[min(calc(92vh-10rem),640px)]"
                      >
                        <h3
                          id="team-members-heading"
                          className="shrink-0 text-sm font-semibold text-foreground"
                        >
                          Members ({teamDetail.members.length})
                        </h3>
                        {/* Scroll member rows only; keeps Add member visible (flexbox + min-h-0). */}
                        <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
                          {teamDetail.members.map((m) => (
                            <li
                              key={m.id}
                              className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar name={m.user.email} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium leading-tight">
                                    {m.user.email}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {m.user.name?.trim() ? m.user.name : '—'}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="shrink-0 text-destructive hover:text-destructive"
                                onClick={() => void removeTeamMember(m.user_id)}
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-4 shrink-0 space-y-3 border-t border-border/80 pt-4">
                          <div className="space-y-1">
                            <Label htmlFor="add_member" className="text-foreground">
                              Add member
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Choose an active org member who is not already on this team.
                            </p>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <select
                                id="add_member"
                                className={cn(
                                  selectCls,
                                  'mt-0 block h-11 w-full min-w-0 max-w-full px-3 py-0'
                                )}
                                disabled={orgUsersLoading}
                                value={addMemberId}
                                onChange={(e) => setAddMemberId(e.target.value)}
                              >
                                <option value="">
                                  {orgUsersLoading ? 'Loading people…' : 'Select a person…'}
                                </option>
                                {orgUserOptions.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.email} — {u.name}
                                  </option>
                                ))}
                              </select>
                              {!orgUsersLoading && orgUserOptions.length === 0 ? (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  No one else can be added — everyone eligible is already on this
                                  team.
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              size="lg"
                              className="w-full shrink-0 sm:w-auto sm:min-w-[10rem]"
                              disabled={!addMemberId || orgUsersLoading}
                              onClick={() => void addTeamMember()}
                            >
                              Add to team
                            </Button>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:px-8',
                      teamDetailLoading && 'pointer-events-none opacity-50'
                    )}
                  >
                    <Button
                      type="button"
                      loading={detailSaving}
                      onClick={() => void saveTeamDetail()}
                    >
                      Save changes
                    </Button>
                  </div>
                </div>
              </DialogContent>
            ) : null}
          </Dialog>
        </>
      ) : null}

      {canInvite ? (
        <Dialog
          open={inviteOpen}
          onOpenChange={(open) => {
            setInviteOpen(open)
            if (!open) resetInviteForm()
          }}
        >
          <DialogContent className="overflow-visible sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite user</DialogTitle>
              <DialogDescription>
                Send an email invitation. Add their first and last name so it becomes their display
                name when they join. They will choose a password when they accept. You can send more
                invites from this window without closing it.
              </DialogDescription>
            </DialogHeader>
            {inviteSuccessEmail ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-500/35 bg-emerald-500/[0.08] px-3 py-2.5 text-sm dark:border-emerald-400/30 dark:bg-emerald-500/[0.12]"
              >
                <p className="font-medium text-emerald-950 dark:text-emerald-50">
                  Invitation sent to {inviteSuccessEmail}
                </p>
                <p className="mt-1 text-emerald-900/80 dark:text-emerald-100/85">
                  Add another person below to keep inviting. Name fields and role stay as you last
                  chose.
                </p>
              </div>
            ) : null}
            <div className="grid gap-4 py-2">
              <div>
                <Label htmlFor="invite_email">Email</Label>
                <Input
                  ref={inviteEmailInputRef}
                  id="invite_email"
                  type="email"
                  className="mt-1"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteSuccessEmail(null)
                    setInviteEmail(e.target.value)
                  }}
                  placeholder="colleague@company.com"
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="invite_first_name">First name</Label>
                  <Input
                    id="invite_first_name"
                    className="mt-1"
                    value={inviteFirstName}
                    onChange={(e) => {
                      setInviteSuccessEmail(null)
                      setInviteFirstName(e.target.value)
                    }}
                    placeholder="Jane"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <Label htmlFor="invite_last_name">Last name</Label>
                  <Input
                    id="invite_last_name"
                    className="mt-1"
                    value={inviteLastName}
                    onChange={(e) => {
                      setInviteSuccessEmail(null)
                      setInviteLastName(e.target.value)
                    }}
                    placeholder="Doe"
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="invite_role">Role when they join</Label>
                <select
                  id="invite_role"
                  className={cn(selectCls, 'mt-1 block max-w-none')}
                  value={inviteRole}
                  onChange={(e) => {
                    setInviteSuccessEmail(null)
                    setInviteRole(e.target.value as InviteRoleOption)
                  }}
                >
                  {getInviteRoleOptionsForOrgRole(role).map((opt) => (
                    <option key={opt} value={opt}>
                      {orgMemberRoleDisplayLabel(opt)}
                    </option>
                  ))}
                </select>
              </div>
              {inviteRole === 'employee' ? (
                <LineManagerCombobox
                  id="invite_line_manager"
                  label="Reports to"
                  value={inviteManagerId}
                  onValueChange={(id) => {
                    setInviteSuccessEmail(null)
                    setInviteManagerId(id)
                  }}
                  options={managerOptions}
                  loading={managersLoading}
                  placeholder="Choose who they report to…"
                  noOptionsText="No active owners, admins, or managers found in this organization."
                  helperText="Search by name or email. Owners, admins, and managers can be a line manager."
                />
              ) : null}
            </div>
            <DialogFooter className="mt-6 gap-3 border-t border-border/70 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-w-[6.5rem] border-border/80 bg-background hover:bg-muted/70"
                onClick={() => {
                  setInviteOpen(false)
                  resetInviteForm()
                }}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-w-[6.5rem] shadow-sm"
                loading={inviteSubmitting}
                onClick={() => void submitInvite()}
              >
                Send invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {tab === 'invitations' && canInvite ? (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/40 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[12rem] flex-1">
                <Label htmlFor="inv_search">Search by email</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="inv_search"
                    value={invitesSearchInput}
                    onChange={(e) => setInvitesSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setInvitesSearch(invitesSearchInput)
                        setInvitesPage(1)
                      }
                    }}
                    placeholder="colleague@company.com"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      setInvitesSearch(invitesSearchInput)
                      setInvitesPage(1)
                    }}
                  >
                    Go
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="inv_status_f">Status</Label>
                <select
                  id="inv_status_f"
                  className={cn(selectCls, 'mt-1 block')}
                  value={invitesStatusFilter}
                  onChange={(e) => {
                    setInvitesStatusFilter(
                      e.target.value as '' | 'pending' | 'accepted' | 'expired'
                    )
                    setInvitesPage(1)
                  }}
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
            <Button type="button" className="shrink-0" onClick={() => setInviteOpen(true)}>
              Invite user
            </Button>
          </div>

          {invitesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : invites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
              <p className="font-medium text-foreground">No invitations found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjust filters or invite someone new.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Reports to</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Invited by</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invites.map((inv) => {
                    const canActOnInvite = canManageExistingInviteForRole(role, inv.role)
                    return (
                      <tr key={inv.id} className="bg-card transition-colors hover:bg-muted/20">
                        <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-foreground">
                          {inv.email}
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3 text-muted-foreground">
                          {inviteRowDisplayName(inv)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={roleBadgeVariant(normalizeApiUserRole(inv.role))}
                            className="font-normal"
                          >
                            {orgMemberRoleDisplayLabel(normalizeApiUserRole(inv.role))}
                          </Badge>
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3 text-muted-foreground">
                          {normalizeApiUserRole(inv.role) === 'employee'
                            ? inv.line_manager?.name?.trim() || inv.line_manager?.email || '—'
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={inviteStatusBadgeVariant(inv.status)}
                            className="font-normal capitalize"
                          >
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3 text-muted-foreground">
                          {inv.invited_by?.email ?? inv.invited_by?.name ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {inv.status === 'accepted'
                            ? `Accepted ${formatInviteDate(inv.accepted_at)}`
                            : formatInviteDate(inv.expires_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {inv.status !== 'accepted' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                loading={resendingId === inv.id}
                                disabled={!canActOnInvite || !!resendingId || !!revokingId}
                                title={
                                  canActOnInvite
                                    ? undefined
                                    : 'Your role cannot resend invitations for this account type.'
                                }
                                onClick={() => void resendInvite(inv)}
                              >
                                Resend
                              </Button>
                            ) : null}
                            {inv.status !== 'accepted' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                loading={revokingId === inv.id}
                                disabled={!canActOnInvite || !!resendingId || !!revokingId}
                                title={
                                  canActOnInvite
                                    ? undefined
                                    : 'Your role cannot revoke invitations for this account type.'
                                }
                                onClick={() => setRevokeConfirmInvite(inv)}
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {invitesTotal > 25 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="tabular-nums text-foreground/90">
                  {(invitesPage - 1) * 25 + 1}–{Math.min(invitesPage * 25, invitesTotal)}
                </span>
                <span> of </span>
                <span className="tabular-nums text-foreground/90">{invitesTotal}</span>
                <span> invitations</span>
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={invitesPage <= 1}
                  onClick={() => setInvitesPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={invitesPage >= Math.ceil(invitesTotal / 25)}
                  onClick={() => setInvitesPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          <ConfirmDialog
            open={Boolean(revokeConfirmInvite)}
            onOpenChange={(open) => {
              if (!open) setRevokeConfirmInvite(null)
            }}
            title="Revoke invitation"
            description={`Are you sure you want to revoke the invitation for ${revokeConfirmInvite?.email ?? ''}? They will no longer be able to use their invite link.`}
            confirmLabel="Revoke"
            variant="danger"
            onConfirm={() => {
              if (revokeConfirmInvite) void revokeInvite(revokeConfirmInvite)
            }}
          />
        </>
      ) : null}

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
            key={editRow.id}
            className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
            onInteractOutside={(e) => {
              const el = e.target as HTMLElement
              if (el.closest('[data-radix-popper-content-wrapper]')) e.preventDefault()
            }}
          >
            <DialogHeader>
              <DialogTitle className="break-all">{editRow.email}</DialogTitle>
              <DialogDescription>
                Account record · Display name: {editRow.name?.trim() ? editRow.name : '—'}
              </DialogDescription>
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
                        onChange={(e) => {
                          const next = e.target.value as 'employee' | 'manager' | 'admin'
                          setEditRole(next)
                          if (next === 'employee' || next === 'manager') {
                            setEditManagerId((prev) => {
                              if (prev !== '') return prev
                              const first = managersExcluding(editRow.id)[0]
                              return first?.id ?? ''
                            })
                          }
                        }}
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

              {orgAdmin &&
              canAssignManager &&
              !locked(editRow) &&
              authzReady &&
              !managerDemoteTarget ? (
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Line manager
                  </legend>
                  <div>
                    <LineManagerCombobox
                      id="edit_manager"
                      label="Reports to"
                      value={lineManagerSelectValue}
                      onValueChange={setEditManagerId}
                      options={editMgrChoices}
                      loading={managersLoading}
                      allowNone={editRole === 'admin'}
                      noneLabel="— No line manager —"
                      placeholder="Choose who they report to…"
                      noOptionsText="No active owners, admins, or managers found in this organization."
                    />
                  </div>
                </fieldset>
              ) : null}

              {!locked(editRow) && canManageOfflineUser && authzReady ? (
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Offline time
                  </legend>
                  <div>
                    <Label htmlFor="edit_offline">Offline time (override)</Label>
                    <select
                      id="edit_offline"
                      className={cn(selectCls, 'mt-1 block max-w-none')}
                      value={editOffline}
                      onChange={(e) => setEditOffline(e.target.value as '' | 'yes' | 'no')}
                    >
                      <option value="">Inherit org (self-service vs request)</option>
                      <option value="yes">Always self-service (no approval queue)</option>
                      <option value="no">Cannot use offline time</option>
                    </select>
                  </div>
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
            <DialogFooter className="mt-6 gap-3 border-t border-border/70 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-w-[6.5rem] border-border/80 bg-background hover:bg-muted/70"
                onClick={() => {
                  setEditOpen(false)
                  setEditRow(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-w-[7.5rem] shadow-sm"
                onClick={() => void saveEdit()}
                disabled={editSaving}
                loading={editSaving}
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={suspendConfirmUser != null}
        onOpenChange={(open) => {
          if (!open) setSuspendConfirmUser(null)
        }}
        title="Suspend user?"
        description={
          suspendConfirmUser
            ? `Suspend ${suspendConfirmUser.email}? They will lose access until reactivated.`
            : undefined
        }
        variant="danger"
        confirmLabel="Suspend"
        onConfirm={async () => {
          if (suspendConfirmUser) await executeSuspendUser(suspendConfirmUser)
        }}
      />
      <ConfirmDialog
        open={teamPendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setTeamPendingDelete(null)
        }}
        title="Delete team?"
        description={
          teamPendingDelete ? (
            <>
              Delete team{' '}
              <span className="font-medium text-foreground">“{teamPendingDelete.name}”</span>? This
              cannot be undone.
            </>
          ) : undefined
        }
        variant="danger"
        confirmLabel="Delete team"
        onConfirm={executeDeleteTeam}
      />
    </div>
  )
}
