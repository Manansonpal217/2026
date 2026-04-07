'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getSession, signIn, useSession } from 'next-auth/react'
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeOrgRole } from '@/lib/roles'

function safeCallback(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/myhome'
}

/** Managers should land on team home (`/myhome`), not the analytics dashboard, when auth sends them back here from `/myhome/dashboard`. */
function resolvePostLoginHref(
  callbackUrl: string,
  opts: { isPlatformAdmin: boolean; role: string | undefined }
): string {
  if (opts.isPlatformAdmin && callbackUrl === '/myhome') {
    return '/admin/dashboard'
  }
  if (
    normalizeOrgRole(opts.role) === 'manager' &&
    (callbackUrl === '/myhome/dashboard' || callbackUrl === '/myhome/dashboard/')
  ) {
    return '/myhome'
  }
  return callbackUrl
}

function ErrorBar({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 border-l-4 border-l-red-600 px-4 py-3 dark:border-red-500/20 dark:border-l-red-500/70 dark:bg-red-500/[0.08]">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      <p className="text-sm leading-snug text-red-800 dark:text-red-300/90">{message}</p>
    </div>
  )
}

const authInputClass =
  'h-12 rounded-xl border-border bg-background shadow-sm placeholder:text-muted-foreground/70 transition-all focus:bg-background focus:ring-2 focus:ring-ring/35 focus:border-primary/45'
const labelClass = 'text-xs font-medium uppercase tracking-wider text-muted-foreground/80'

function AuthPanel() {
  const searchParams = useSearchParams()
  const { status, data: session } = useSession()
  const callbackUrl = safeCallback(searchParams?.get('callbackUrl') ?? null)

  useEffect(() => {
    if (status !== 'authenticated') return
    const sessionErr = (session as { error?: string } | null)?.error
    if (sessionErr === 'RefreshAccessTokenError') return
    const dest = resolvePostLoginHref(callbackUrl, {
      isPlatformAdmin: session?.user?.is_platform_admin === true,
      role: session?.user?.role as string | undefined,
    })
    window.location.href = dest
  }, [status, callbackUrl, session])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signInError, setSignInError] = useState('')
  const [signInLoading, setSignInLoading] = useState(false)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setSignInError('')
    setSignInLoading(true)
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.ok) {
        const s = await getSession()
        window.location.href = resolvePostLoginHref(callbackUrl, {
          isPlatformAdmin: s?.user?.is_platform_admin === true,
          role: s?.user?.role as string | undefined,
        })
      } else {
        setSignInError('Invalid email or password. Please check your credentials.')
      }
    } catch {
      setSignInError('Something went wrong. Please try again.')
    } finally {
      setSignInLoading(false)
    }
  }

  return (
    <div className="w-full animate-fade-in-up">
      <div className="mb-8 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Welcome <span className="text-gradient">back</span>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Sign in to your organization console.
        </p>
      </div>

      <form onSubmit={handleSignIn} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
            autoComplete="email"
            className={authInputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={labelClass}>
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              autoComplete="current-password"
              className={cn(authInputClass, 'pr-11')}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex justify-end pt-0.5">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {signInError && <ErrorBar message={signInError} />}

        <Button
          type="submit"
          variant="gradient"
          loading={signInLoading}
          className="btn-shimmer mt-2 h-12 w-full rounded-xl text-[15px] font-semibold"
        >
          {!signInLoading && <ArrowRight className="h-4 w-4" />}
          Sign in
        </Button>

        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Need an account or organization?{' '}
          <Link
            href="/contact"
            className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary/90"
          >
            Contact us
          </Link>
        </p>
      </form>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground/50">
        By continuing you agree to our{' '}
        <Link
          href="/terms"
          className="text-muted-foreground/70 underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
        >
          Terms of Service
        </Link>
        .
      </p>
    </div>
  )
}

function LoginFallback() {
  return <div className="h-64 w-full animate-pulse rounded-2xl bg-muted/50" />
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
      <div className="relative w-full max-w-[440px]">
        <Card className="overflow-hidden rounded-2xl border-border/80 shadow-auth-card dark:shadow-auth-card-dark">
          <CardContent className="rounded-2xl bg-gradient-to-br from-card via-card to-primary/[0.04] p-8 sm:p-10 dark:from-card dark:via-card dark:to-card">
            <Suspense fallback={<LoginFallback />}>
              <AuthPanel />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
