'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, CheckCircle2, Layers, Shield, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { OrgAgentTokenPanel } from '../../org-agent-token-panel'
import { cn } from '@/lib/utils'

const WORK_PLATFORMS = [
  { value: 'jira_cloud', label: 'Jira / Atlassian Cloud' },
  { value: 'asana', label: 'Asana' },
  { value: 'jira_self_hosted', label: 'Jira self-hosted (agent)' },
  { value: 'none', label: 'None' },
] as const

function rowSwitch(
  id: string,
  label: string,
  checked: boolean,
  onCheckedChange: (v: boolean) => void
) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function AdminCreateOrgPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [createdOrg, setCreatedOrg] = useState<{ id: string; name: string } | null>(null)

  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workPlatform, setWorkPlatform] = useState<string>('jira_cloud')

  const [screenshotIntervalSeconds, setScreenshotIntervalSeconds] = useState(60)
  const [blurScreenshots, setBlurScreenshots] = useState(false)
  const [timeApprovalRequired, setTimeApprovalRequired] = useState(false)
  const [idleDetectionEnabled, setIdleDetectionEnabled] = useState(true)
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(5)
  const [idleTimeoutIntervals, setIdleTimeoutIntervals] = useState(3)
  const [expectedDailyWorkMinutes, setExpectedDailyWorkMinutes] = useState(480)
  const [allowEmployeeOfflineTime, setAllowEmployeeOfflineTime] = useState(false)
  const [trackKeyboard, setTrackKeyboard] = useState(true)
  const [trackMouse, setTrackMouse] = useState(true)
  const [trackAppUsage, setTrackAppUsage] = useState(true)
  const [trackUrl, setTrackUrl] = useState(false)
  const [mfaRequiredAdmins, setMfaRequiredAdmins] = useState(false)
  const [mfaRequiredManagers, setMfaRequiredManagers] = useState(false)

  function resetForAnother() {
    setOrgName('')
    setSlug('')
    setFullName('')
    setEmail('')
    setPassword('')
    setWorkPlatform('jira_cloud')
    setScreenshotIntervalSeconds(60)
    setBlurScreenshots(false)
    setTimeApprovalRequired(false)
    setIdleDetectionEnabled(true)
    setIdleTimeoutMinutes(5)
    setIdleTimeoutIntervals(3)
    setExpectedDailyWorkMinutes(480)
    setAllowEmployeeOfflineTime(false)
    setTrackKeyboard(true)
    setTrackMouse(true)
    setTrackAppUsage(true)
    setTrackUrl(false)
    setMfaRequiredAdmins(false)
    setMfaRequiredManagers(false)
    setCreatedOrg(null)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { data } = await api.post<{
        organization?: { id: string; name: string }
      }>('/v1/platform/orgs', {
        org_name: orgName,
        slug: slug.trim().toLowerCase(),
        full_name: fullName,
        email: email.trim().toLowerCase(),
        password,
        work_platform: workPlatform,
        settings: {
          screenshot_interval_seconds: screenshotIntervalSeconds,
          blur_screenshots: blurScreenshots,
          time_approval_required: timeApprovalRequired,
          idle_detection_enabled: idleDetectionEnabled,
          idle_timeout_minutes: idleTimeoutMinutes,
          idle_timeout_intervals: idleTimeoutIntervals,
          expected_daily_work_minutes: expectedDailyWorkMinutes,
          allow_employee_offline_time: allowEmployeeOfflineTime,
          track_keyboard: trackKeyboard,
          track_mouse: trackMouse,
          track_app_usage: trackAppUsage,
          track_url: trackUrl,
          mfa_required_for_admins: mfaRequiredAdmins,
          mfa_required_for_managers: mfaRequiredManagers,
        },
      })
      if (data.organization?.id) {
        setCreatedOrg({ id: data.organization.id, name: data.organization.name })
        adminToast.success(
          'Organization created successfully',
          'A verification email was sent to the admin. For self-hosted Jira, generate an agent token below.'
        )
        router.refresh()
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      const msg = ax.response?.data?.message ?? 'Could not create organization.'
      adminToast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass = cn(
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  )

  if (createdOrg) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" asChild>
            <Link href="/admin/orgs">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All organizations
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {createdOrg.name} is ready
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A verification email was sent to the admin. For self-hosted Jira, generate an agent
                token below.
              </p>
            </div>
          </div>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" aria-hidden />
              Agent token
            </CardTitle>
            <CardDescription>
              For self-hosted Jira, share this token with whoever installs the TrackSync agent on
              the customer network. The token is shown only once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrgAgentTokenPanel
              orgId={createdOrg.id}
              orgName={createdOrg.name}
              active
              bordered={false}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={resetForAnother}>
            Create another organization
          </Button>
          <Button asChild>
            <Link href="/admin/orgs">Back to organizations</Link>
          </Button>
        </div>
      </div>
    )
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
        <h2 className="text-2xl font-bold tracking-tight text-foreground">New organization</h2>
        <p className="text-sm text-muted-foreground">
          Create a tenant with initial org settings, work platform, and the first organization
          admin.
        </p>
      </div>

      <form id="create-org-page-form" onSubmit={onCreate} className="space-y-8">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" aria-hidden />
              Tenant
            </CardTitle>
            <CardDescription>Organization name and URL slug.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" aria-hidden />
              Work platform
            </CardTitle>
            <CardDescription>
              Controls which cloud &quot;Connect&quot; action appears in the desktop app.
              Self-hosted Jira uses the agent only—no OAuth button in the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="work-platform">Platform</Label>
            <select
              id="work-platform"
              className={selectClass}
              value={workPlatform}
              onChange={(e) => setWorkPlatform(e.target.value)}
            >
              {WORK_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-primary" aria-hidden />
              Organization admin
            </CardTitle>
            <CardDescription>
              First user for this tenant. They receive a verification email to activate the account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Org defaults</CardTitle>
            <CardDescription>
              Match policies to the client before go-live. Admins can change these later in
              settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion
              type="multiple"
              className="rounded-lg border border-border"
              defaultValue={['screenshots']}
            >
              <AccordionItem value="screenshots" className="border-b-0">
                <AccordionTrigger className="px-4 py-3 text-sm">
                  Screenshots &amp; retention
                </AccordionTrigger>
                <AccordionContent className="space-y-3 px-4 pb-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ss-int">Capture interval (seconds)</Label>
                      <Input
                        id="ss-int"
                        type="number"
                        min={60}
                        max={3600}
                        value={screenshotIntervalSeconds}
                        onChange={(e) => setScreenshotIntervalSeconds(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Retention policy</Label>
                      <p className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        Fixed at 9 months (270 days) for all organizations.
                      </p>
                    </div>
                  </div>
                  {rowSwitch('blur-ss', 'Blur screenshots', blurScreenshots, setBlurScreenshots)}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="idle" className="border-t border-border">
                <AccordionTrigger className="px-4 py-3 text-sm">Idle &amp; time</AccordionTrigger>
                <AccordionContent className="space-y-3 px-4 pb-4">
                  {rowSwitch(
                    'idle-det',
                    'Idle detection',
                    idleDetectionEnabled,
                    setIdleDetectionEnabled
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="idle-min">Idle timeout (minutes)</Label>
                      <Input
                        id="idle-min"
                        type="number"
                        min={1}
                        max={60}
                        value={idleTimeoutMinutes}
                        onChange={(e) => setIdleTimeoutMinutes(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="idle-int">Idle intervals</Label>
                      <Input
                        id="idle-int"
                        type="number"
                        min={1}
                        max={10}
                        value={idleTimeoutIntervals}
                        onChange={(e) => setIdleTimeoutIntervals(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expected-day">Expected work per day (minutes)</Label>
                    <Input
                      id="expected-day"
                      type="number"
                      min={15}
                      max={1440}
                      value={expectedDailyWorkMinutes}
                      onChange={(e) => setExpectedDailyWorkMinutes(Number(e.target.value))}
                    />
                  </div>
                  {rowSwitch(
                    'time-appr',
                    'Time approval required',
                    timeApprovalRequired,
                    setTimeApprovalRequired
                  )}
                  {rowSwitch(
                    'off-time',
                    'Allow employee offline time',
                    allowEmployeeOfflineTime,
                    setAllowEmployeeOfflineTime
                  )}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="activity" className="border-t border-border">
                <AccordionTrigger className="px-4 py-3 text-sm">Activity tracking</AccordionTrigger>
                <AccordionContent className="space-y-1 px-4 pb-4">
                  {rowSwitch('tk', 'Track keyboard', trackKeyboard, setTrackKeyboard)}
                  {rowSwitch('tm', 'Track mouse', trackMouse, setTrackMouse)}
                  {rowSwitch('ta', 'Track app usage', trackAppUsage, setTrackAppUsage)}
                  {rowSwitch('tu', 'Track URLs', trackUrl, setTrackUrl)}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="mfa" className="border-t border-border">
                <AccordionTrigger className="px-4 py-3 text-sm">MFA policy</AccordionTrigger>
                <AccordionContent className="space-y-1 px-4 pb-4">
                  {rowSwitch(
                    'mfa-a',
                    'MFA required for admins',
                    mfaRequiredAdmins,
                    setMfaRequiredAdmins
                  )}
                  {rowSwitch(
                    'mfa-m',
                    'MFA required for managers',
                    mfaRequiredManagers,
                    setMfaRequiredManagers
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/orgs">Cancel</Link>
          </Button>
          <Button type="submit" form="create-org-page-form" loading={submitting}>
            Create organization
          </Button>
        </div>
      </form>
    </div>
  )
}
