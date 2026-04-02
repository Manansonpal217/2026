'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { api } from '@/lib/api'
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

type CreateUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  /** Shown in the description, e.g. "Acme (acme-inc)" */
  orgLabel?: string
  orgSlug?: string
  onCreated?: () => void | Promise<void>
}

export function CreateUserDialog({
  open,
  onOpenChange,
  orgId,
  orgLabel,
  orgSlug,
  onCreated,
}: CreateUserDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'super_admin' | 'admin' | 'manager' | 'employee'>(
    'employee'
  )

  function resetForm() {
    setNewName('')
    setNewEmail('')
    setNewPassword('')
    setNewRole('employee')
    setFormMessage(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetForm()
    }
    onOpenChange(next)
  }

  async function onCreate(e: FormEvent) {
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
      await onCreated?.()
      handleOpenChange(false)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      const msg = ax.response?.data?.message ?? 'Could not create user.'
      setFormMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = Boolean(orgId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add user to organization</DialogTitle>
          <DialogDescription>
            {orgLabel ? (
              <>
                Creating an account in{' '}
                <span className="font-medium text-foreground">{orgLabel}</span>. Org roles do not
                grant platform admin access.
              </>
            ) : (
              <>
                Creates an active account. Choose org super admin, admin, manager, or employee. This
                does not make someone a platform admin.
              </>
            )}
            {orgSlug ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                Sign-in may require organization slug: {orgSlug}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form id="create-user-form" onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dialog-new-name">Full name</Label>
            <Input
              id="dialog-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              autoComplete="name"
              disabled={!canSubmit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dialog-new-email">Email</Label>
            <Input
              id="dialog-new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={!canSubmit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dialog-new-password">Password</Label>
            <Input
              id="dialog-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={!canSubmit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dialog-new-role">Role</Label>
            <select
              id="dialog-new-role"
              className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
              value={newRole}
              onChange={(e) =>
                setNewRole(e.target.value as 'super_admin' | 'admin' | 'manager' | 'employee')
              }
              disabled={!canSubmit}
            >
              <option value="employee">Employee — own activity only</option>
              <option value="manager">Manager — their team</option>
              <option value="admin">Admin — whole organization</option>
              <option value="super_admin">Super admin — full control in this org</option>
            </select>
          </div>
        </form>
        {formMessage ? <p className="text-sm text-destructive">{formMessage}</p> : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-user-form" loading={submitting} disabled={!canSubmit}>
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
