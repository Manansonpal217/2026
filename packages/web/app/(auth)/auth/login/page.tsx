'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Zap, ArrowRight, Shield, Activity, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const features = [
  {
    icon: Activity,
    label: 'Real-time tracking',
    description: 'Live activity and time monitoring',
  },
  {
    icon: Shield,
    label: 'Enterprise security',
    description: 'SOC2-grade data protection',
  },
  {
    icon: Globe,
    label: 'Global workforce',
    description: 'Manage distributed teams at scale',
  },
]

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  // Validate callbackUrl to prevent open redirect — only allow relative paths
  const rawCallbackUrl = searchParams.get('callbackUrl') || '/admin/dashboard'
  const callbackUrl =
    rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')
      ? rawCallbackUrl
      : '/admin/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email,
        password,
        org_slug: orgSlug || undefined,
        redirect: false,
      })
      if (result?.ok) {
        window.location.href = callbackUrl
      } else {
        setError('Invalid email or password. Please check your credentials.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 flex-col justify-between p-12 relative">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow-indigo">
            <Zap className="h-5 w-5 text-white" fill="white" />
          </div>
          <span className="text-lg font-bold text-foreground">TrackSync</span>
        </div>

        {/* Center content */}
        <div className="space-y-8 animate-fade-in-up">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Work Intelligence Platform
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight">
              <span className="text-foreground">Track work,</span>
              <br />
              <span className="text-gradient">build trust.</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-sm">
              The complete platform for monitoring productivity, managing teams, and delivering
              transparency — all in one place.
            </p>
          </div>

          <div className="space-y-4">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.label} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{feature.label}</p>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground/50">
          © 2026 TrackSync. Enterprise work intelligence.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div
          className={cn(
            'w-full max-w-sm space-y-8 animate-fade-in-up',
          )}
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
              <Zap className="h-4 w-4 text-white" fill="white" />
            </div>
            <span className="text-base font-bold text-foreground">TrackSync</span>
          </div>

          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to your admin panel to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                autoComplete="email"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org">
                Organization slug{' '}
                <span className="text-muted-foreground/50 font-normal">(optional)</span>
              </Label>
              <Input
                id="org"
                type="text"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="acme-corp"
                autoComplete="off"
                className="h-11"
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <div className="h-4 w-4 shrink-0 rounded-full bg-destructive/20 flex items-center justify-center mt-0.5">
                  <span className="text-destructive text-xs font-bold">!</span>
                </div>
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
              Sign in
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground/60">
            By signing in you agree to our{' '}
            <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors underline underline-offset-2">
              Terms of Service
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
