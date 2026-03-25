'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type OrgRow = {
  id: string
  name: string
  slug: string
  status: string
  plan: string
  created_at: string
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
    } catch (e: unknown) {
      setError('Failed to load organizations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormMessage(null)
    setSubmitting(true)
    try {
      await api.post('/v1/platform/orgs', {
        org_name: orgName,
        slug: slug.trim().toLowerCase(),
        full_name: fullName,
        email: email.trim().toLowerCase(),
        password,
      })
      setFormMessage({
        type: 'ok',
        text: 'Organization created. Verification email sent to the admin.',
      })
      setOrgName('')
      setSlug('')
      setFullName('')
      setEmail('')
      setPassword('')
      await load()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; code?: string } } }
      const msg = ax.response?.data?.message ?? 'Could not create organization.'
      setFormMessage({ type: 'err', text: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground">Create organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a tenant, default settings, and an initial super admin user.
        </p>
        <form onSubmit={onCreate} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org_name">Organization name</Label>
            <Input
              id="org_name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              placeholder="Acme Inc"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              placeholder="acme-inc"
              pattern="[a-z0-9\-]+"
              title="Lowercase letters, numbers, and hyphens only"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Admin full name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Admin email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Admin password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" loading={submitting}>
              Create organization
            </Button>
          </div>
        </form>
        {formMessage ? (
          <p
            className={
              formMessage.type === 'ok'
                ? 'mt-4 text-sm text-emerald-600 dark:text-emerald-400'
                : 'mt-4 text-sm text-destructive'
            }
          >
            {formMessage.text}
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">All organizations</h2>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Slug</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No organizations yet.
                    </td>
                  </tr>
                ) : (
                  orgs.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{o.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.slug}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.plan}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
