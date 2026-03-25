'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Props = {
  screenshotId: string
  className?: string
  fallback: React.ReactNode
}

export function AuthScreenshotThumb({ screenshotId, className, fallback }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let blobUrl: string | null = null
    setStatus('loading')
    setUrl(null)
    ;(async () => {
      try {
        const res = await api.get<Blob>(`/v1/screenshots/${screenshotId}/file`, {
          responseType: 'blob',
        })
        const u = URL.createObjectURL(res.data)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        blobUrl = u
        setUrl(u)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [screenshotId])

  if (status === 'ready' && url) {
    return <img src={url} alt="" className={className} />
  }
  return <>{fallback}</>
}
