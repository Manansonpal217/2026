'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  Layers,
  Shield,
  UserPlus,
} from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  const [createdOrg, setCreatedOrg] = useState<{ id: string; name: string; slug: string } | null>(
    null
  )

  const [orgName, setOrgName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workPlatform, setWorkPlatform] = useState<string>('jira_cloud')

  const [screenshotIntervalSeconds, setScreenshotIntervalSeconds] = useState<number | ''>(60)
  const [blurScreenshots, setBlurScreenshots] = useState(false)
  const [timeApprovalRequired, setTimeApprovalRequired] = useState(false)
  const [idleDetectionEnabled, setIdleDetectionEnabled] = useState(true)
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number | ''>(5)
  const [expectedDailyWorkMinutes, setExpectedDailyWorkMinutes] = useState<number | ''>(480)
  const [allowEmployeeOfflineTime, setAllowEmployeeOfflineTime] = useState(false)
  const [trackKeyboard, setTrackKeyboard] = useState(true)
  const [trackMouse, setTrackMouse] = useState(true)
  const [trackAppUsage, setTrackAppUsage] = useState(true)
  const [trackUrl, setTrackUrl] = useState(false)
  function resetForAnother() {
    setOrgName('')
    setFullName('')
    setEmail('')
    setPassword('')
    setWorkPlatform('jira_cloud')
    setScreenshotIntervalSeconds(60)
    setBlurScreenshots(false)
    setTimeApprovalRequired(false)
    setIdleDetectionEnabled(true)
    setIdleTimeoutMinutes(5)
    setExpectedDailyWorkMinutes(480)
    setAllowEmployeeOfflineTime(false)
    setTrackKeyboard(true)
    setTrackMouse(true)
    setTrackAppUsage(true)
    setTrackUrl(false)
    setCreatedOrg(null)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { data } = await api.post<{
        organization?: { id: string; name: string; slug: string }
      }>('/v1/platform/orgs', {
        org_name: orgName,
        full_name: fullName,
        email: email.trim().toLowerCase(),
        password,
        work_platform: workPlatform,
        settings: {
          screenshot_interval_seconds:
            screenshotIntervalSeconds === '' ? 60 : screenshotIntervalSeconds,
          blur_screenshots: blurScreenshots,
          time_approval_required: timeApprovalRequired,
          idle_detection_enabled: idleDetectionEnabled,
          idle_timeout_minutes: idleTimeoutMinutes === '' ? 5 : idleTimeoutMinutes,
          expected_daily_work_minutes:
            expectedDailyWorkMinutes === '' ? 480 : expectedDailyWorkMinutes,
          allow_employee_offline_time: allowEmployeeOfflineTime,
          track_keyboard: trackKeyboard,
          track_mouse: trackMouse,
          track_app_usage: trackAppUsage,
          track_url: trackUrl,
        },
      })
      if (data.organization?.id) {
        setCreatedOrg({
          id: data.organization.id,
          name: data.organization.name,
          slug: data.organization.slug,
        })
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
                A verification email was sent to the admin. Organization URL slug:{' '}
                <span className="font-mono text-foreground">{createdOrg.slug}</span>. For
                self-hosted Jira, generate an agent token below.
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
            <CardDescription>
              Display name only; a unique URL slug is assigned automatically from this name.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="org_name">Organization name</Label>
              <Input
                id="org_name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                placeholder="Acme Inc"
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  id="work-platform"
                  variant="outline"
                  aria-haspopup="listbox"
                  className="h-10 w-full justify-between rounded-lg border-border bg-input font-normal shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.04)] hover:bg-input hover:border-border focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span className="truncate text-left">
                    {WORK_PLATFORMS.find((p) => p.value === workPlatform)?.label ?? workPlatform}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[var(--radix-dropdown-menu-trigger-width,12rem)] max-w-[calc(100vw-2rem)]"
              >
                <DropdownMenuRadioGroup value={workPlatform} onValueChange={setWorkPlatform}>
                  {WORK_PLATFORMS.map((p) => (
                    <DropdownMenuRadioItem key={p.value} value={p.value}>
                      {p.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
                <AccordionTrigger className="px-4 py-3 text-sm">Screenshots</AccordionTrigger>
                <AccordionContent className="space-y-3 px-4 pb-4">
                  <div className="space-y-2">
                    <Label htmlFor="ss-int">Capture interval (seconds)</Label>
                    <Input
                      id="ss-int"
                      type="number"
                      min={60}
                      max={3600}
                      value={screenshotIntervalSeconds}
                      onChange={(e) => {
                        const v = e.target.value
                        setScreenshotIntervalSeconds(v === '' ? '' : Number(v))
                      }}
                      onBlur={() => {
                        if (screenshotIntervalSeconds === '') setScreenshotIntervalSeconds(60)
                        else
                          setScreenshotIntervalSeconds(
                            Math.min(3600, Math.max(60, screenshotIntervalSeconds))
                          )
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    {rowSwitch(
                      'blur-ss',
                      'Allow employees to request screenshot blur',
                      blurScreenshots,
                      setBlurScreenshots
                    )}
                    <p className="text-xs text-muted-foreground pl-0.5">
                      When on, employees can opt in per capture in the desktop app. Org admins can
                      remove blur for specific users under Organization → Per-user overrides.
                    </p>
                  </div>
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
                  <div className="space-y-2">
                    <Label htmlFor="idle-min">Idle after no activity (minutes)</Label>
                    <Input
                      id="idle-min"
                      type="number"
                      min={1}
                      max={60}
                      value={idleTimeoutMinutes}
                      onChange={(e) => {
                        const v = e.target.value
                        setIdleTimeoutMinutes(v === '' ? '' : Number(v))
                      }}
                      onBlur={() => {
                        if (idleTimeoutMinutes === '') setIdleTimeoutMinutes(5)
                        else setIdleTimeoutMinutes(Math.min(60, Math.max(1, idleTimeoutMinutes)))
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expected-day">Expected work per day (minutes)</Label>
                    <Input
                      id="expected-day"
                      type="number"
                      min={15}
                      max={1440}
                      value={expectedDailyWorkMinutes}
                      onChange={(e) => {
                        const v = e.target.value
                        setExpectedDailyWorkMinutes(v === '' ? '' : Number(v))
                      }}
                      onBlur={() => {
                        if (expectedDailyWorkMinutes === '') setExpectedDailyWorkMinutes(480)
                        else
                          setExpectedDailyWorkMinutes(
                            Math.min(1440, Math.max(15, expectedDailyWorkMinutes))
                          )
                      }}
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
