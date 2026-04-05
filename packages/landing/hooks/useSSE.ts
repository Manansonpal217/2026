'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

type SSEEvent = { type: string; payload: unknown }

export function useSSE(onEvent: (evt: SSEEvent) => void) {
  const { data: session } = useSession()
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent

  useEffect(() => {
    const token = (session as { accessToken?: string } | null)?.accessToken
    if (!token) return

    let es: EventSource | null = null
    let backoff = MIN_BACKOFF_MS
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    function connect() {
      if (destroyed) return
      es = new EventSource(`${API_URL}/v1/app/notifications/stream`, {
        withCredentials: false,
      })

      // We need auth but EventSource doesn't support headers.
      // Fallback: use cookie-based auth if available, or polyfill via fetch-event-source.
      // For now rely on cookie auth set by next-auth session.

      es.onopen = () => {
        backoff = MIN_BACKOFF_MS
      }

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as SSEEvent
          cbRef.current(data)
        } catch {
          /* malformed event */
        }
      }

      es.addEventListener('notification', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as SSEEvent
          cbRef.current(data)
        } catch {
          /* malformed */
        }
      })

      es.onerror = () => {
        es?.close()
        es = null
        if (destroyed) return
        reconnectTimer = setTimeout(() => {
          connect()
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }, backoff)
      }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [session])
}
