'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [orgId, setOrgId] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'super_admin' | 'admin' | 'manager' | 'employee'>(
    'employee'
  )

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

  async function onCreateUser(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setFormMessage(null)
    setSubmitting(true)
    try {
      await api.post(`/v1/platform/orgs/${encodeURIComponent(orgId)}/users`, {
        name: newName,
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      })
      const slug = orgs.find((o) => o.id === orgId)?.slug
      setFormMessage({
        type: 'ok',
        text: slug
          ? `User created. Sign-in may require organization slug: ${slug}.`
          : 'User created. They can sign in with this email and password.',
      })
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('employee')
      await loadUsers()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      const msg = ax.response?.data?.message ?? 'Could not create user.'
      setFormMessage({ type: 'err', text: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
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

      {orgId ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-card-foreground">
            Add user to this organization
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creates an active account. Choose org super admin (full control in this company), org
            admin, manager, or employee. This does not make someone a platform admin.
          </p>
          <form onSubmit={onCreateUser} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-name">Full name</Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <select
                id="new-role"
                className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                value={newRole}
                onChange={(e) =>
                  setNewRole(e.target.value as 'super_admin' | 'admin' | 'manager' | 'employee')
                }
              >
                <option value="employee">Employee — own activity only</option>
                <option value="manager">Manager — their team</option>
                <option value="admin">Admin — whole organization</option>
                <option value="super_admin">Super admin — full control in this org</option>
              </select>
            </div>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit" loading={submitting} disabled={!orgId}>
                Create user
              </Button>
            </div>
          </form>
          {formMessage ? (
            <p
              className={
                formMessage.type === 'ok'
                  ? 'mt-4 text-sm text-emerald-600 dark:text-emerald-400'
                  : 'mt-4 text-sm text-destructive'
              }
            >
              {formMessage.text}
            </p>
          ) : null}
        </section>
      ) : null}

      <div>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Users</h2>
          {orgId ? (
            <span className="text-sm text-muted-foreground">{total} in this org</span>
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
