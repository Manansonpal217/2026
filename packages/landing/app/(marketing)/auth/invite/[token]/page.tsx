'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const authInputClass =
  'h-12 rounded-xl border-border bg-background shadow-sm placeholder:text-muted-foreground/70 transition-all focus:bg-background focus:ring-2 focus:ring-ring/35 focus:border-primary/45'
const labelClass = 'text-xs font-medium uppercase tracking-wider text-muted-foreground/80'

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

type InviteInfo = {
  email: string
  org_name: string
  role: string
  expires_at: string
}

export default function InviteAcceptPage() {
  const params = useParams()
  const token = typeof params?.token === 'string' ? params.token : ''

  const [phase, setPhase] = useState<'loading' | 'form' | 'done' | 'error'>('loading')
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadInfo = useCallback(async () => {
    if (!token) {
      setPhase('error')
      setErrorMessage('Invalid invitation link.')
      return
    }
    setPhase('loading')
    setErrorMessage(null)
    try {
      const res = await fetch(
        `${API_URL}/v1/public/auth/invite/info?token=${encodeURIComponent(token)}`,
        { method: 'GET', credentials: 'omit' }
      )
      const data = (await res.json()) as { message?: string; email?: string }
      if (!res.ok) {
        setPhase('error')
        setErrorMessage(data.message ?? 'This invitation is invalid or has expired.')
        return
      }
      setInfo(data as InviteInfo)
      setPhase('form')
    } catch {
      setPhase('error')
      setErrorMessage('Could not load invitation. Check your connection and try again.')
    }
  }, [token])

  useEffect(() => {
    void loadInfo()
  }, [loadInfo])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    const name = fullName.trim()
    if (!name) {
      setErrorMessage('Enter your name.')
      return
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`${API_URL}/v1/public/auth/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ token, full_name: name, password }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) {
        setErrorMessage(data.message ?? 'Could not accept invitation.')
        return
      }
      setPhase('done')
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
      <div className="relative w-full max-w-[440px]">
        <Card className="overflow-hidden rounded-2xl border-border/80 shadow-auth-card dark:shadow-auth-card-dark">
          <CardContent className="rounded-2xl bg-gradient-to-br from-card via-card to-primary/[0.04] p-8 sm:p-10 dark:from-card dark:via-card dark:to-card">
            {phase === 'loading' ? (
              <div className="h-48 animate-pulse rounded-2xl bg-muted/50" aria-busy />
            ) : null}

            {phase === 'error' ? (
              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <AlertCircle className="h-12 w-12 text-destructive" aria-hidden />
                </div>
                <h1 className="font-display text-2xl font-semibold text-foreground">
                  Invitation unavailable
                </h1>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/login">Back to sign in</Link>
                </Button>
              </div>
            ) : null}

            {phase === 'form' && info ? (
              <div className="animate-fade-in-up">
                <div className="mb-8 text-center">
                  <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                    Join <span className="text-gradient">{info.org_name}</span>
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You are invited as{' '}
                    <strong className="text-foreground">{roleLabel(info.role)}</strong>
                    <span className="block truncate text-xs normal-case text-muted-foreground/90">
                      {info.email}
                    </span>
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                  {errorMessage ? (
                    <div
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
                        'border-red-200 bg-red-50 border-l-4 border-l-red-600 dark:border-red-500/20 dark:border-l-red-500/70 dark:bg-red-500/[0.08]'
                      )}
                    >
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <p className="leading-snug text-red-800 dark:text-red-300/90">
                        {errorMessage}
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="invite-full-name" className={labelClass}>
                      Full name
                    </Label>
                    <Input
                      id="invite-full-name"
                      className={authInputClass}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite-password" className={labelClass}>
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="invite-password"
                        type={showPassword ? 'text' : 'password'}
                        className={cn(authInputClass, 'pr-12')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl text-base"
                    loading={submitting}
                  >
                    Create account
                  </Button>
                </form>
              </div>
            ) : null}

            {phase === 'done' ? (
              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <CheckCircle2
                    className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                </div>
                <h1 className="font-display text-2xl font-semibold text-foreground">
                  You are all set
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your account is active. Sign in with the email from your invite and the password
                  you chose.
                </p>
                <Button asChild className="mt-2 w-full rounded-xl">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
