'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
  mfa_enabled: boolean
}

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

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const canCreateCrossTenantUsers = session?.user?.is_platform_admin === true

  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [orgId, setOrgId] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const selectedOrg = useMemo(() => orgs.find((o) => o.id === orgId), [orgs, orgId])

  const loadOrgs = useCallback(async () => {
    setError(null)
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
      setError('Failed to load organizations.')
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
    setError(null)
    setLoadingUsers(true)
    try {
      const { data } = await api.get<{ users: UserRow[]; total: number }>(
        `/v1/platform/orgs/${encodeURIComponent(orgId)}/users`,
        { params: { page: 1, limit: 100 } }
      )
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Failed to load users for this organization.')
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
      {canCreateCrossTenantUsers ? (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          orgId={orgId}
          orgLabel={selectedOrg ? `${selectedOrg.name} (${selectedOrg.slug})` : undefined}
          orgSlug={selectedOrg?.slug}
          onCreated={loadUsers}
        />
      ) : null}

      <div className="max-w-md space-y-2">
        <label htmlFor="org-select" className="text-sm font-medium text-muted-foreground">
          Organization
        </label>
        <select
          id="org-select"
          className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          disabled={loadingOrgs || orgs.length === 0}
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

      <div>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold text-foreground">Users</h2>
            {orgId ? (
              <span className="text-sm text-muted-foreground">{total} in this org</span>
            ) : null}
          </div>
          {canCreateCrossTenantUsers ? (
            <Button
              type="button"
              className="shrink-0 gap-2 self-start sm:self-auto"
              disabled={!orgId}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New user
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loadingOrgs || loadingUsers ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">MFA</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {!orgId || users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      {orgId ? 'No users in this organization.' : 'Select an organization.'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">{roleLabel(u.role)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.mfa_enabled ? 'On' : 'Off'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(u.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
