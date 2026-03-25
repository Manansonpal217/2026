'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn, useSession, SessionProvider } from 'next-auth/react'
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function safeCallback(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/myhome'
}

function ErrorBar({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 border-l-4 border-l-red-600 px-4 py-3 dark:border-red-500/20 dark:border-l-red-500/70 dark:bg-red-500/[0.08]">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      <p className="text-sm leading-snug text-red-800 dark:text-red-300/90">{message}</p>
    </div>
  )
}

function AuthPanel() {
  const searchParams = useSearchParams()
  const { status, data: session } = useSession()
  const callbackUrl = safeCallback(searchParams?.get('callbackUrl') ?? null)

  useEffect(() => {
    if (status !== 'authenticated') return
    const sessionErr = (session as { error?: string } | null)?.error
    if (sessionErr === 'RefreshAccessTokenError') return
    window.location.href = callbackUrl
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
        window.location.href = callbackUrl
      } else {
        setSignInError('Invalid email or password. Please check your credentials.')
      }
    } catch {
      setSignInError('Something went wrong. Please try again.')
    } finally {
      setSignInLoading(false)
    }
  }

  const inputCx =
    'h-12 rounded-xl border border-border bg-background/90 shadow-sm shadow-indigo-950/[0.04] placeholder:text-muted-foreground/65 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50 focus:shadow-md focus:shadow-primary/5 dark:bg-input dark:shadow-none dark:focus:shadow-none transition-all'
  const labelCx = 'text-xs font-medium uppercase tracking-wider text-muted-foreground/75'

  return (
    <div className="w-full animate-fade-in-up">
      <div className="mb-8 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Welcome <span className="text-gradient">back</span>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Sign in to your organization console.
        </p>
      </div>

      <form onSubmit={handleSignIn} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className={labelCx}>
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
            className={inputCx}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={labelCx}>
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
          <div className="flex justify-end pt-0.5">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80 dark:text-indigo-400/90 dark:hover:text-indigo-300"
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
            className="font-semibold text-primary underline decoration-primary/25 underline-offset-[3px] transition-colors hover:text-primary/85 dark:decoration-border dark:hover:text-indigo-300"
          >
            Contact us
          </Link>
        </p>
      </form>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground/40">
        By continuing you agree to our{' '}
        <Link
          href="/terms"
          className="text-muted-foreground/60 underline decoration-border underline-offset-[3px] transition-colors hover:text-foreground"
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
    <SessionProvider>
      <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
        <div className="relative w-full max-w-[440px]">
          <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.07] p-8 shadow-auth-card backdrop-blur-[10px] dark:border-border dark:from-card dark:via-card dark:to-card dark:shadow-auth-card-dark sm:p-10">
            <Suspense fallback={<LoginFallback />}>
              <AuthPanel />
            </Suspense>
          </div>
        </div>
      </main>
    </SessionProvider>
  )
}
