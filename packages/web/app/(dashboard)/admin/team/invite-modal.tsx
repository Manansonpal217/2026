'use client'

import { useState } from 'react'
import { Mail, UserPlus, AlertCircle, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface InviteModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const ROLES = [
  {
    value: 'employee',
    label: 'Employee',
    description: 'Can track time and view their own data',
    color: 'text-slate-400',
  },
  {
    value: 'manager',
    label: 'Manager',
    description: 'Can view team reports and approve time',
    color: 'text-cyan-400',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access to organization settings',
    color: 'text-indigo-400',
  },
]

export function InviteModal({ open, onClose, onSuccess }: InviteModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('employee')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message || 'Failed to send invite')
        return
      }

      setEmail('')
      setRole('employee')
      onSuccess()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectedRole = ROLES.find((r) => r.value === role)

  const handleClose = () => {
    setEmail('')
    setRole('employee')
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <UserPlus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription className="mt-0.5">
                Send an invitation link to your colleague
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="colleague@company.com"
                autoComplete="off"
                className="h-11 pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role" className="h-11">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="flex flex-col">
                      <span className="font-medium">{r.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                {selectedRole.description}
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive/90">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button type="submit" variant="gradient" loading={loading} className="flex-1 sm:flex-none">
              {!loading && <UserPlus className="h-4 w-4" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
