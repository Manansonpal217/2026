'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PLAN_OPTIONS = ['trial', 'starter', 'pro', 'enterprise']
const STATUS_OPTIONS = ['active', 'suspended'] as const

const selectClass = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
)

export default function EditOrgPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const searchParams = useSearchParams()
  const router = useRouter()

  const [name, setName] = useState(searchParams?.get('name') ?? '')
  const [slug, setSlug] = useState(searchParams?.get('slug') ?? '')
  const [plan, setPlan] = useState(searchParams?.get('plan') ?? 'trial')
  const [status, setStatus] = useState<'active' | 'suspended'>(
    (searchParams?.get('status') as 'active' | 'suspended') ?? 'active'
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api.patch(`/v1/platform/orgs/${id}`, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        plan: plan.trim(),
        status,
      })
      router.push('/admin/orgs')
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      setError(ax.response?.data?.message ?? 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" asChild>
          <Link href="/admin/orgs">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All organizations
          </Link>
        </Button>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Edit organization</h2>
        <p className="text-sm text-muted-foreground">
          Update display name, URL slug, plan, or status. No users are removed.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" aria-hidden />
              Organization details
            </CardTitle>
            <CardDescription>Core organization identity and billing plan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="organization"
                placeholder="Acme Inc"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9\-]+"
                title="Lowercase letters, numbers, and hyphens only"
                placeholder="acme-inc"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-plan">Plan</Label>
              <select
                id="edit-plan"
                className={selectClass}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                {!PLAN_OPTIONS.includes(plan) && plan ? <option value={plan}>{plan}</option> : null}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/orgs">Cancel</Link>
          </Button>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  )
}
