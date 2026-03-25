'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const inputCx =
    'h-12 rounded-xl border border-border bg-background/90 shadow-sm shadow-indigo-950/[0.04] placeholder:text-muted-foreground/65 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50 focus:shadow-md focus:shadow-primary/5 dark:bg-input dark:shadow-none dark:focus:shadow-none transition-all'
  const labelCx = 'text-xs font-medium uppercase tracking-wider text-muted-foreground/75'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/public/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          ...(orgSlug.trim() && { org_slug: orgSlug.trim().toLowerCase() }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          typeof data.message === 'string'
            ? data.message
            : 'Something went wrong. Please try again.'
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

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
      <div className="relative w-full max-w-[440px]">
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.07] p-8 shadow-auth-card backdrop-blur-[10px] dark:border-border dark:from-card dark:via-card dark:to-card dark:shadow-auth-card-dark sm:p-10">
          <Link
            href="/login"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <div className="mb-8 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Reset <span className="text-gradient">password</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Enter your email and we will send you a link to choose a new password.
            </p>
          </div>

          {done ? (
            <div className="space-y-4">
              <p className="text-center text-sm leading-relaxed text-muted-foreground">
                If an account exists for this email, we sent password reset instructions.
              </p>
              <Button asChild variant="outline" className="h-12 w-full rounded-xl">
                <Link href="/login">Return to sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
                <Label htmlFor="org_slug" className={labelCx}>
                  Organization URL slug{' '}
                  <span className="font-normal normal-case text-muted-foreground/60">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="org_slug"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="acme-corp"
                  autoComplete="organization"
                  className={inputCx}
                />
                <p className="text-xs leading-relaxed text-muted-foreground/70">
                  Required if your email is used in more than one workspace.
                </p>
              </div>

              {error && <ErrorBar message={error} />}

              <Button
                type="submit"
                variant="gradient"
                loading={loading}
                className="btn-shimmer mt-2 h-12 w-full rounded-xl text-[15px] font-semibold"
              >
                {!loading && <ArrowRight className="h-4 w-4" />}
                Send reset link
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
