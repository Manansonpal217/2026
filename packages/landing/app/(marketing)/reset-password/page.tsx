'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function ErrorBar({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 border-l-4 border-l-red-600 px-4 py-3 dark:border-red-500/20 dark:border-l-red-500/70 dark:bg-red-500/[0.08]">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      <p className="text-sm leading-snug text-red-800 dark:text-red-300/90">{message}</p>
    </div>
  )
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')?.trim() ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const inputCx =
    'h-12 rounded-xl border border-border bg-background/90 shadow-sm shadow-indigo-950/[0.04] placeholder:text-muted-foreground/65 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50 focus:shadow-md focus:shadow-primary/5 dark:bg-input dark:shadow-none dark:focus:shadow-none transition-all'
  const labelCx = 'text-xs font-medium uppercase tracking-wider text-muted-foreground/75'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/public/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          typeof data.message === 'string'
            ? data.message
            : 'Could not reset password. Try requesting a new link.'
        )
        return
      }
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <ErrorBar message="This reset link is missing a token. Open the link from your email, or request a new reset." />
        <Button asChild variant="outline" className="h-12 w-full rounded-xl">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Your password has been updated. You can sign in with your new password.
        </p>
        <Button
          asChild
          variant="gradient"
          className="btn-shimmer h-12 w-full rounded-xl text-[15px] font-semibold"
        >
          <Link href="/login">
            <ArrowRight className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password" className={labelCx}>
          New password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="8+ characters"
            autoComplete="new-password"
            className={cn(inputCx, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm" className={labelCx}>
          Confirm password
        </Label>
        <Input
          id="confirm"
          type={showPassword ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          placeholder="Re-enter password"
          autoComplete="new-password"
          className={inputCx}
        />
      </div>

      {error && <ErrorBar message={error} />}

      <Button
        type="submit"
        variant="gradient"
        loading={loading}
        className="btn-shimmer mt-2 h-12 w-full rounded-xl text-[15px] font-semibold"
      >
        {!loading && <ArrowRight className="h-4 w-4" />}
        Update password
      </Button>
    </form>
  )
}

function ResetFallback() {
  return <div className="h-48 w-full animate-pulse rounded-xl bg-muted/50" />
}

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
      <div className="relative w-full max-w-[440px]">
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.07] p-8 shadow-auth-card backdrop-blur-[10px] dark:border-border dark:from-card dark:via-card dark:to-card dark:shadow-auth-card-dark sm:p-10">
          <Link
            href="/login"
            className="mb-6 inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>

          <div className="mb-8 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              New <span className="text-gradient">password</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Choose a strong password for your account.
            </p>
          </div>

          <Suspense fallback={<ResetFallback />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
