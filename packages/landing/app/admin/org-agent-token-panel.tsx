'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type OrgAgentTokenPanelProps = {
  orgId: string
  orgName: string
  /** When false, skip outer card border (e.g. inside another dialog). */
  bordered?: boolean
  className?: string
  /** When this becomes false, clear token UI (e.g. dialog closed). */
  active?: boolean
}

export function OrgAgentTokenPanel({
  orgId,
  orgName,
  bordered = true,
  className,
  active = true,
}: OrgAgentTokenPanelProps) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!active) {
      setToken(null)
      setCopied(false)
    }
  }, [active])

  useEffect(() => {
    setToken(null)
    setCopied(false)
  }, [orgId])

  async function generate() {
    setCopied(false)
    setLoading(true)
    try {
      const { data } = await api.post<{ token: string }>(
        `/v1/platform/orgs/${orgId}/agent-token`,
        {}
      )
      setToken(data.token)
      adminToast.success('Agent token generated')
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      adminToast.error(ax.response?.data?.message ?? 'Could not create token.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      adminToast.success('Token copied to clipboard')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      adminToast.error('Could not copy to clipboard.')
    }
  }

  const inner = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        For the TrackSync Jira agent on{' '}
        <span className="font-medium text-foreground">{orgName}</span>&apos;s server. Set{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">TRACKSYNC_TOKEN</code> or{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">tracksync.token</code> in the agent
        config. The raw token is shown only once.
      </p>
      {!token ? (
        <Button type="button" className="gap-2" loading={loading} onClick={() => void generate()}>
          <KeyRound className="h-4 w-4" aria-hidden />
          Generate token
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Copy this value</label>
          <Textarea
            readOnly
            rows={4}
            className="resize-y font-mono text-xs leading-relaxed"
            value={token}
            onFocus={(e) => e.target.select()}
          />
          <Button type="button" variant="outline" className="gap-2" onClick={() => void copy()}>
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden />
                Copy to clipboard
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )

  if (!bordered) {
    return <div className={className}>{inner}</div>
  }

  return (
    <div className={cn('rounded-xl border border-border bg-muted/20 p-4', className)}>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Server agent token</h3>
      {inner}
    </div>
  )
}

type OrgAgentTokenDialogProps = {
  orgId: string
  orgName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrgAgentTokenDialog({
  orgId,
  orgName,
  open,
  onOpenChange,
}: OrgAgentTokenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agent token — {orgName}</DialogTitle>
          <DialogDescription>
            Generate a token for the TrackSync Jira agent. Copy it into the customer&apos;s server
            config.
          </DialogDescription>
        </DialogHeader>
        <OrgAgentTokenPanel orgId={orgId} orgName={orgName} bordered={false} active={open} />
      </DialogContent>
    </Dialog>
  )
}
