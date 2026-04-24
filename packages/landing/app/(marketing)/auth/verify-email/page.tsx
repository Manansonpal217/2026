'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type Phase = 'loading' | 'success' | 'error'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')?.trim() ?? ''

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const verify = useCallback(async () => {
    if (!token) {
      setErrorMessage('This verification link is missing a token. Use the link from your email.')
      setPhase('error')
      return
    }

    try {
      const res = await fetch(
        `${API_URL}/v1/public/auth/verify-email?token=${encodeURIComponent(token)}`,
        { method: 'GET', credentials: 'omit' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMessage(
          typeof data.message === 'string'
            ? data.message
            : 'This verification link is invalid or has expired.'
        )
        setPhase('error')
        return
      }
      setPhase('success')
    } catch {
      setErrorMessage('Something went wrong. Check your connection and try again.')
      setPhase('error')
    }
  }, [token])

  useEffect(() => {
    void verify()
  }, [verify])

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Verifying your email…</p>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Email verified!</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your email address has been confirmed. You can now sign in to your account.
        </p>
        <Button
          asChild
          variant="gradient"
          className="btn-shimmer mt-2 h-12 w-full rounded-xl text-[15px] font-semibold"
        >
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <AlertCircle className="h-12 w-12 text-destructive" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Verification failed</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {errorMessage ?? 'This verification link is invalid or has expired.'}
      </p>
      <Button asChild variant="outline" className="h-12 w-full rounded-xl">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  )
}

function VerifyEmailFallback() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Verifying your email…</p>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16 sm:py-24">
      <div className="relative w-full max-w-[440px]">
        <Card className="overflow-hidden rounded-2xl border-border/80 shadow-auth-card dark:shadow-auth-card-dark">
          <CardContent className="rounded-2xl bg-gradient-to-br from-card via-card to-primary/[0.04] p-8 sm:p-10 dark:from-card dark:via-card dark:to-card">
            <Suspense fallback={<VerifyEmailFallback />}>
              <VerifyEmailContent />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
