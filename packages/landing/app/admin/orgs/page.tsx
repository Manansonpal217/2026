'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { KeyRound, MoreHorizontal, Pencil, Plus, Power } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OrgAgentTokenDialog } from '../org-agent-token-panel'
import { cn } from '@/lib/utils'

type OrgRow = {
  id: string
  name: string
  slug: string
  status: string
  plan: string
  created_at: string
}

export default function AdminOrgsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canMutatePlatformOrgs = session?.user?.is_platform_admin === true

  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenOrg, setTokenOrg] = useState<{ id: string; name: string } | null>(null)

  const [statusTarget, setStatusTarget] = useState<{
    org: OrgRow
    nextStatus: 'active' | 'suspended'
  } | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  function openEdit(o: OrgRow) {
    const params = new URLSearchParams({
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      status: o.status,
    })
    router.push(`/admin/orgs/${o.id}/edit?${params.toString()}`)
  }

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.get<{ organizations: OrgRow[]; total: number }>(
        '/v1/platform/orgs',
        {
          params: { page: 1, limit: 100 },
        }
      )
      setOrgs(data.organizations ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Failed to load organizations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function applyStatusChange() {
    if (!statusTarget) return
    setStatusError(null)
    setStatusSaving(true)
    try {
      await api.patch(`/v1/platform/orgs/${statusTarget.org.id}`, {
        status: statusTarget.nextStatus,
      })
      setStatusTarget(null)
      await load()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setStatusError(ax.response?.data?.message ?? 'Could not update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {tokenOrg ? (
        <OrgAgentTokenDialog
          key={tokenOrg.id}
          orgId={tokenOrg.id}
          orgName={tokenOrg.name}
          open
          onOpenChange={(o) => {
            if (!o) setTokenOrg(null)
          }}
        />
      ) : null}

      <Dialog
        open={statusTarget !== null}
        onOpenChange={(o) => {
          if (!o) setStatusTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.nextStatus === 'suspended'
                ? 'Deactivate organization'
                : 'Reactivate organization'}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.nextStatus === 'suspended'
                ? 'Members cannot sign in until the organization is reactivated. Data is kept; this is not a delete.'
                : 'Members can sign in again. Agent tokens and data are unchanged.'}
            </DialogDescription>
          </DialogHeader>
          {statusTarget ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{statusTarget.org.name}</span>
              {' · '}
              {statusTarget.org.slug}
            </p>
          ) : null}
          {statusError ? <p className="text-sm text-destructive">{statusError}</p> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              className={
                statusTarget?.nextStatus === 'suspended'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-none'
                  : undefined
              }
              onClick={applyStatusChange}
              disabled={statusSaving}
            >
              {statusSaving
                ? 'Updating…'
                : statusTarget?.nextStatus === 'suspended'
                  ? 'Deactivate'
                  : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">All organizations</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{total} total</p>
        </div>
        {canMutatePlatformOrgs ? (
          <Button asChild className="shrink-0 gap-2 self-start sm:self-auto">
            <Link href="/admin/orgs/new">
              <Plus className="h-4 w-4" aria-hidden />
              New organization
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Slug</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 font-medium text-muted-foreground w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No organizations yet.
                  </td>
                </tr>
              ) : (
                orgs.map((o) => (
                  <tr
                    key={o.id}
                    className={cn(
                      'border-b border-border last:border-0',
                      o.status === 'suspended' && 'bg-muted/20 text-muted-foreground'
                    )}
                  >
                    <td
                      className={cn(
                        'px-4 py-3 font-medium',
                        o.status === 'suspended' ? 'text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {o.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{o.slug}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.plan}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.status}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {canMutatePlatformOrgs ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Organization actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2" onClick={() => openEdit(o)}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                              Edit
                            </DropdownMenuItem>
                            {o.status === 'active' ? (
                              <DropdownMenuItem
                                className="gap-2 text-destructive focus:text-destructive"
                                onClick={() => {
                                  setStatusError(null)
                                  setStatusTarget({ org: o, nextStatus: 'suspended' })
                                }}
                              >
                                <Power className="h-3.5 w-3.5" aria-hidden />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => {
                                  setStatusError(null)
                                  setStatusTarget({ org: o, nextStatus: 'active' })
                                }}
                              >
                                <Power className="h-3.5 w-3.5" aria-hidden />
                                Reactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => setTokenOrg({ id: o.id, name: o.name })}
                            >
                              <KeyRound className="h-3.5 w-3.5" aria-hidden />
                              Agent token
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
