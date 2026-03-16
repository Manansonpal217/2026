'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { RefreshCw, ArrowLeft, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface IntegrationDetail {
  id: string
  type: string
  name: string
  status: string
  last_sync_at: string | null
  created_at: string
  config: Record<string, unknown>
}

interface Stats {
  projects: number
  tasks: number
}

export function IntegrationDetailClient({ id }: { id: string }) {
  const { data: session } = useSession()
  const [detail, setDetail] = useState<IntegrationDetail | null>(null)
  const [stats, setStats] = useState<Stats>({ projects: 0, tasks: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const token = (session as { access_token?: string })?.access_token

  async function fetchDetail() {
    if (!token) return
    const res = await fetch(`${API_URL}/v1/integrations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setDetail(data.integration)
      setStats(data.stats)
    }
    setLoading(false)
  }

  useEffect(() => { fetchDetail() }, [token]) // eslint-disable-line

  async function syncNow() {
    if (!token) return
    setSyncing(true)
    await fetch(`${API_URL}/v1/integrations/${id}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    await fetchDetail()
    setSyncing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Integration not found.
        <Link href="/admin/integrations" className="block mt-2 text-primary hover:underline text-sm">
          ← Back to Integrations
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/integrations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold capitalize">{detail.name}</h1>
          <p className="text-xs text-muted-foreground">{detail.type} integration</p>
        </div>
      </div>

      {/* Status card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Status', value: detail.status, icon: detail.status === 'error' ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <CheckCircle className="h-4 w-4 text-emerald-400" /> },
          { label: 'Projects', value: stats.projects.toString() },
          { label: 'Tasks', value: stats.tasks.toString() },
          { label: 'Connected', value: new Date(detail.created_at).toLocaleDateString() },
        ].map(({ label, value, icon }) => (
          <div key={label} className="p-4 rounded-xl border border-border/50 bg-surface/50">
            <div className="flex items-center gap-1.5 mb-1">
              {icon}
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-lg font-bold capitalize">{value}</p>
          </div>
        ))}
      </div>

      {/* Last sync */}
      <div className="p-4 rounded-xl border border-border/50 bg-surface/50 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Last Sync</p>
          <p className="text-xs text-muted-foreground">
            {detail.last_sync_at
              ? new Date(detail.last_sync_at).toLocaleString()
              : 'Never synced'}
          </p>
        </div>
        <Button size="sm" disabled={syncing} onClick={syncNow}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          Sync Now
        </Button>
      </div>
    </div>
  )
}
