'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Filter } from 'lucide-react'
import { ScreenshotGallery } from '@/components/ScreenshotGallery'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Screenshot {
  id: string
  taken_at: string
  activity_score: number
  is_blurred: boolean
  signed_url: string
  file_size_bytes: number
}

export default function ScreenshotsPage() {
  const { data: session } = useSession()
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
  const LIMIT = 40

  const token = (session as { access_token?: string })?.access_token

  useEffect(() => {
    async function fetchScreenshots() {
      if (!token) return
      setLoading(true)
      try {
        const params = new URLSearchParams({
          from: `${from}T00:00:00.000Z`,
          to: `${to}T23:59:59.000Z`,
          page: String(page),
          limit: String(LIMIT),
        })
        const res = await fetch(`${API_URL}/v1/screenshots?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setScreenshots(data.screenshots)
          setTotal(data.total)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchScreenshots()
  }, [token, from, to, page])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Screenshots</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {loading ? '…' : `${total} screenshots`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border/50 bg-surface/50">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            className="bg-surface border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            className="bg-surface border border-border/50 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Gallery */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScreenshotGallery screenshots={screenshots} showBlur />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm rounded border border-border/50 disabled:opacity-40 hover:bg-white/5"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm rounded border border-border/50 disabled:opacity-40 hover:bg-white/5"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
