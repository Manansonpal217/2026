'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Plug, RefreshCw, Trash2, CheckCircle, AlertTriangle, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Integration {
  id: string
  type: string
  name: string
  status: 'active' | 'syncing' | 'error' | 'disconnected'
  last_sync_at: string | null
  created_at: string
}

const PROVIDER_LOGOS: Record<string, string> = {
  jira: '🟦',
  asana: '🟧',
}

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  jira: 'Sync projects, issues and log time to Jira.',
  asana: 'Sync projects, tasks and post time comments to Asana.',
}

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'syncing': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
    case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30'
    default: return 'bg-white/10 text-muted-foreground border-border/30'
  }
}

export function IntegrationsClient() {
  const { data: session } = useSession()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const token = (session as { access_token?: string })?.access_token

  async function fetchIntegrations() {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/v1/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setIntegrations((await res.json()).integrations)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function connectProvider(provider: string) {
    if (!token) return
    const res = await fetch(`${API_URL}/v1/integrations/connect/${provider}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const { auth_url } = await res.json()
      window.location.href = auth_url
    }
  }

  async function syncIntegration(id: string) {
    if (!token) return
    setBusy((p) => ({ ...p, [id]: true }))
    await fetch(`${API_URL}/v1/integrations/${id}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    await fetchIntegrations()
    setBusy((p) => ({ ...p, [id]: false }))
  }

  async function disconnectIntegration(id: string) {
    if (!token) return
    await fetch(`${API_URL}/v1/integrations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setDeleteTarget(null)
    await fetchIntegrations()
  }

  const connectedTypes = new Set(integrations.map((i) => i.type))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your project management tools to sync tasks and log time automatically.
        </p>
      </div>

      {/* Available providers */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Available Integrations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['jira', 'asana'] as const).map((provider) => (
            <div
              key={provider}
              className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-surface/50"
            >
              <div className="text-3xl">{PROVIDER_LOGOS[provider]}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium capitalize">{provider}</p>
                <p className="text-xs text-muted-foreground">{PROVIDER_DESCRIPTIONS[provider]}</p>
              </div>
              <Button
                size="sm"
                disabled={connectedTypes.has(provider)}
                onClick={() => connectProvider(provider)}
                variant={connectedTypes.has(provider) ? 'ghost' : 'default'}
              >
                {connectedTypes.has(provider) ? (
                  <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Connected</>
                ) : (
                  <><Plug className="h-3.5 w-3.5 mr-1.5" />Connect</>
                )}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Connected integrations */}
      {integrations.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Connected
          </h2>
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : (
              integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-surface/50"
                >
                  <div className="text-2xl">{PROVIDER_LOGOS[integration.type] ?? '🔗'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{integration.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${statusColor(integration.status)}`}>
                        {integration.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {integration.last_sync_at
                        ? `Last synced ${new Date(integration.last_sync_at).toLocaleString()}`
                        : 'Never synced'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy[integration.id]}
                      onClick={() => syncIntegration(integration.id)}
                      title="Sync now"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy[integration.id] ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(integration)}
                      title="Disconnect"
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Disconnect confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="bg-surface border-border/50">
          <DialogHeader>
            <DialogTitle>Disconnect {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the integration and delete all authentication tokens.
            Synced projects and tasks will remain but will no longer update.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && disconnectIntegration(deleteTarget.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
