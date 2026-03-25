'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function OAuthCallbackInner() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'redirecting' | 'error' | 'manual'>('redirecting')

  useEffect(() => {
    const code = searchParams?.get('code')
    const state = searchParams?.get('state')
    const error = searchParams?.get('error')
    if (error) {
      setStatus('error')
      return
    }

    if (!code || !state) {
      setStatus('manual')
      return
    }

    const protocolUrl = `tracksync://oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    window.location.href = protocolUrl

    const fallback = setTimeout(() => {
      setStatus('manual')
    }, 3000)
    return () => clearTimeout(fallback)
  }, [searchParams])

  if (status === 'error') {
    const error = searchParams?.get('error')
    const errorDescription = searchParams?.get('error_description')
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Connection failed</h1>
          <p className="text-muted-foreground mb-4">
            {errorDescription || error || 'An error occurred during Jira authorization.'}
          </p>
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            Return to TrackSync
          </Link>
        </div>
      </main>
    )
  }

  if (status === 'manual') {
    const code = searchParams?.get('code')
    const state = searchParams?.get('state')
    const protocolHref =
      code && state
        ? `tracksync://oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
        : 'tracksync://'

    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Return to TrackSync</h1>
          <p className="text-muted-foreground mb-4">
            {code && state
              ? "If TrackSync didn't open automatically, click the button below to return to the app."
              : 'Missing authorization data. Please try connecting again from the TrackSync app.'}
          </p>
          <a
            href={protocolHref}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Open TrackSync
          </a>
          <p className="mt-6 text-sm text-muted-foreground">
            <Link href="/" className="text-primary hover:underline">
              Back to tracksync.dev
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="animate-pulse mb-4">
          <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent mx-auto animate-spin" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Connecting to Jira</h1>
        <p className="text-muted-foreground">Redirecting you back to TrackSync...</p>
      </div>
    </main>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </main>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  )
}
