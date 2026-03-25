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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type Tab = 'signin' | 'signup'

function safeCallback(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/myhome'
}

function ErrorBar({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border-l-4 border-red-500/70 bg-red-500/[0.08] px-4 py-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
      <p className="text-sm leading-snug text-red-300/90">{message}</p>
    </div>
  )
}

function AuthPanel() {
  const searchParams = useSearchParams()
  const { status, data: session } = useSession()
  const callbackUrl = safeCallback(searchParams?.get('callbackUrl') ?? null)

  const [tab, setTab] = useState<Tab>('signin')

  useEffect(() => {
    if (searchParams?.get('tab') === 'signup') setTab('signup')
  }, [searchParams])

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

  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [fullName, setFullName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showSuPassword, setShowSuPassword] = useState(false)
  const [signUpError, setSignUpError] = useState('')
  const [signUpSuccess, setSignUpSuccess] = useState('')
  const [signUpLoading, setSignUpLoading] = useState(false)

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSignUpError('')
    setSignUpSuccess('')
    if (suPassword !== confirmPassword) {
      setSignUpError('Passwords do not match')
      return
    }
    if (suPassword.length < 8) {
      setSignUpError('Password must be at least 8 characters')
      return
    }
    const normalized = slug.trim().toLowerCase()
    if (!/^[a-z0-9-]{2,40}$/.test(normalized)) {
      setSignUpError(
        'Organization slug must be 2-40 characters: lowercase letters, numbers, and hyphens only'
      )
      return
    }
    setSignUpLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/public/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: orgName.trim(),
          slug: normalized,
          full_name: fullName.trim(),
          email: suEmail.trim().toLowerCase(),
          password: suPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSignUpError(typeof data.message === 'string' ? data.message : 'Could not create account')
        return
      }
      setSignUpSuccess(
        typeof data.message === 'string'
          ? data.message
          : 'Organization created. Check your email to verify your account.'
      )
    } catch {
      setSignUpError('Something went wrong. Please try again.')
    } finally {
      setSignUpLoading(false)
    }
  }

  const inputCx =
    'h-12 rounded-xl border border-border bg-input placeholder:text-muted-foreground/60 focus:bg-background focus:ring-2 focus:ring-ring/35 focus:border-primary/45 transition-all'
  const labelCx = 'text-xs font-medium uppercase tracking-wider text-muted-foreground/70'

  return (
    <div className="w-full animate-fade-in-up">
      {/* Heading */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          {tab === 'signin' ? (
            <>
              Welcome <span className="text-gradient">back</span>
            </>
          ) : (
            <>
              Create your <span className="text-gradient">workspace</span>
            </>
          )}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {tab === 'signin'
            ? 'Sign in to your organization console.'
            : 'Set up a new organization. You will verify your email before signing in.'}
        </p>
      </div>

      {/* Pill tab switcher */}
      <div className="mb-8 flex rounded-xl border border-border bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => {
            setTab('signin')
            setSignUpError('')
            setSignUpSuccess('')
          }}
          className={cn(
            'flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200',
            tab === 'signin'
              ? 'bg-card text-foreground shadow-sm shadow-foreground/10'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('signup')
            setSignInError('')
          }}
          className={cn(
            'flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200',
            tab === 'signup'
              ? 'bg-card text-foreground shadow-sm shadow-foreground/10'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Create account
        </button>
      </div>

      {tab === 'signin' ? (
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
              <button
                type="button"
                className="text-xs font-medium text-indigo-400/80 transition-colors hover:text-indigo-300"
              >
                Forgot password?
              </button>
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
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org_name" className={labelCx}>
                Organization
              </Label>
              <Input
                id="org_name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                placeholder="Acme Inc."
                autoComplete="organization"
                className={inputCx}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug" className={labelCx}>
                URL slug
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                required
                placeholder="acme-corp"
                autoComplete="off"
                className={inputCx}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name" className={labelCx}>
              Your name
            </Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Jane Doe"
              autoComplete="name"
              className={inputCx}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="su_email" className={labelCx}>
              Work email
            </Label>
            <Input
              id="su_email"
              type="email"
              value={suEmail}
              onChange={(e) => setSuEmail(e.target.value)}
              required
              placeholder="you@company.com"
              autoComplete="email"
              className={inputCx}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="su_password" className={labelCx}>
                Password
              </Label>
              <div className="relative">
                <Input
                  id="su_password"
                  type={showSuPassword ? 'text' : 'password'}
                  value={suPassword}
                  onChange={(e) => setSuPassword(e.target.value)}
                  required
                  placeholder="8+ characters"
                  autoComplete="new-password"
                  className={cn(inputCx, 'pr-11')}
                />
                <button
                  type="button"
                  onClick={() => setShowSuPassword(!showSuPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                  tabIndex={-1}
                >
                  {showSuPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password" className={labelCx}>
                Confirm
              </Label>
              <Input
                id="confirm_password"
                type={showSuPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter"
                autoComplete="new-password"
                className={inputCx}
              />
            </div>
          </div>

          {signUpError && <ErrorBar message={signUpError} />}

          {signUpSuccess ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-4 text-sm leading-relaxed text-emerald-300/90">
              {signUpSuccess}
              <button
                type="button"
                className="mt-3 block text-sm font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
                onClick={() => {
                  setTab('signin')
                  setSignUpSuccess('')
                  setSuPassword('')
                  setConfirmPassword('')
                }}
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <Button
              type="submit"
              variant="gradient"
              loading={signUpLoading}
              className="btn-shimmer mt-2 h-12 w-full rounded-xl text-[15px] font-semibold"
            >
              {!signUpLoading && <ArrowRight className="h-4 w-4" />}
              Create organization
            </Button>
          )}
        </form>
      )}

      {/* Legal */}
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
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
        <div className="w-full max-w-[420px]">
          <Suspense fallback={<LoginFallback />}>
            <AuthPanel />
          </Suspense>
        </div>
      </main>
    </SessionProvider>
  )
}
