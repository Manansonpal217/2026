'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, Zap, ArrowRight, Building2, UserCheck, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface InviteInfo {
  email: string
  org_name: string
  role: string
  expires_at: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const roleVariantMap: Record<string, 'super_admin' | 'admin' | 'manager' | 'employee'> = {
  super_admin: 'super_admin',
  admin: 'admin',
  manager: 'manager',
  employee: 'employee',
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
  ]
  const passed = checks.filter((c) => c.pass).length

  if (!password) return null

  return (
    <div className="flex items-center gap-2 mt-1.5">
      {checks.map((c, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-all duration-300',
            c.pass
              ? passed === 1
                ? 'bg-destructive'
                : passed === 2
                  ? 'bg-warning'
                  : 'bg-success'
              : 'bg-border',
          )}
        />
      ))}
      <span className="text-[10px] text-muted-foreground shrink-0">
        {passed === 3 ? 'Strong' : passed === 2 ? 'Fair' : 'Weak'}
      </span>
    </div>
  )
}

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`${API_URL}/v1/public/auth/invite/info?token=${params.token}`)
        if (!res.ok) {
          setInviteError('This invitation is invalid or has expired.')
          return
        }
        const data = await res.json()
        setInviteInfo(data)
      } catch {
        setInviteError('Failed to load invitation details.')
      } finally {
        setFetching(false)
      }
    }
    fetchInvite()
  }, [params.token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/public/auth/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, full_name: fullName, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message || 'Failed to accept invitation')
        return
      }

      const data = await res.json()
      const result = await signIn('credentials', {
        email: data.user.email,
        password,
        org_slug: undefined,
        redirect: false,
      })

      if (result?.ok) {
        router.push('/admin/dashboard')
      } else {
        router.push('/auth/login')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    )
  }

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center animate-fade-in-up">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20 mx-auto">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Invalid Invitation</h2>
            <p className="text-sm text-muted-foreground">{inviteError}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push('/auth/login')}
            className="w-full"
          >
            Back to login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 animate-fade-in-up">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow-sm">
            <Zap className="h-5 w-5 text-white" fill="white" />
          </div>
          <span className="text-base font-bold text-foreground">TrackSync</span>
        </div>

        {/* Invite context card */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <UserCheck className="h-3.5 w-3.5" />
            You have been invited
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{inviteInfo?.org_name}</p>
              <p className="text-xs text-muted-foreground">{inviteInfo?.email}</p>
            </div>
            <div className="ml-auto">
              <Badge variant={roleVariantMap[inviteInfo?.role ?? ''] ?? 'employee'}>
                {inviteInfo?.role?.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">Create your account</h2>
          <p className="text-sm text-muted-foreground">Set up your profile to get started</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={inviteInfo?.email || ''}
              disabled
              className="h-11 opacity-60 cursor-not-allowed"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoFocus
              placeholder="Jane Smith"
              autoComplete="name"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                autoComplete="new-password"
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="new-password"
                className="h-11 pr-10"
                error={!!(confirmPassword && confirmPassword !== password)}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== password && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive/90">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="gradient"
            size="lg"
            loading={loading}
            className="w-full"
          >
            {!loading && <ArrowRight className="h-4 w-4" />}
            Create account &amp; join
          </Button>
        </form>
      </div>
    </div>
  )
}
