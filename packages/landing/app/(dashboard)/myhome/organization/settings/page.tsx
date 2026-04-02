'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { BarChart2, Camera, Clock, Shield, Sliders } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type OrgSettings = {
  screenshot_interval_seconds: number
  screenshot_retention_days: number
  blur_screenshots: boolean
  activity_weight_keyboard: number
  activity_weight_mouse: number
  activity_weight_movement: number
  track_keyboard: boolean
  track_mouse: boolean
  track_app_usage: boolean
  track_url: boolean
  time_approval_required: boolean
  mfa_required_for_admins: boolean
  mfa_required_for_managers: boolean
  expected_daily_work_minutes: number
  allow_employee_offline_time: boolean
}

const DEFAULTS: OrgSettings = {
  screenshot_interval_seconds: 60,
  screenshot_retention_days: 30,
  blur_screenshots: false,
  activity_weight_keyboard: 0.5,
  activity_weight_mouse: 0.3,
  activity_weight_movement: 0.2,
  track_keyboard: true,
  track_mouse: true,
  track_app_usage: true,
  track_url: false,
  time_approval_required: false,
  mfa_required_for_admins: false,
  mfa_required_for_managers: false,
  expected_daily_work_minutes: 480,
  allow_employee_offline_time: false,
}

function cloneOrgSettings(s: OrgSettings): OrgSettings {
  return { ...s }
}

function orgSettingsEqual(a: OrgSettings, b: OrgSettings): boolean {
  return (
    a.screenshot_interval_seconds === b.screenshot_interval_seconds &&
    a.screenshot_retention_days === b.screenshot_retention_days &&
    a.blur_screenshots === b.blur_screenshots &&
    a.activity_weight_keyboard === b.activity_weight_keyboard &&
    a.activity_weight_mouse === b.activity_weight_mouse &&
    a.activity_weight_movement === b.activity_weight_movement &&
    a.track_keyboard === b.track_keyboard &&
    a.track_mouse === b.track_mouse &&
    a.track_app_usage === b.track_app_usage &&
    a.track_url === b.track_url &&
    a.time_approval_required === b.time_approval_required &&
    a.mfa_required_for_admins === b.mfa_required_for_admins &&
    a.mfa_required_for_managers === b.mfa_required_for_managers &&
    a.expected_daily_work_minutes === b.expected_daily_work_minutes &&
    a.allow_employee_offline_time === b.allow_employee_offline_time
  )
}

function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <Label
        htmlFor={id}
        className="cursor-pointer text-sm font-normal leading-snug text-foreground"
      >
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6 pb-10">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-full max-w-md" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="mt-4 h-12 w-full max-w-sm" />
        </div>
      ))}
    </div>
  )
}

export default function OrganizationSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<OrgSettings>(DEFAULTS)
  const [baseline, setBaseline] = useState<OrgSettings | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const { data } = await api.get<{ settings: OrgSettings | null }>('/v1/admin/settings')
      const next: OrgSettings = data.settings
        ? {
            screenshot_interval_seconds: data.settings.screenshot_interval_seconds,
            screenshot_retention_days: data.settings.screenshot_retention_days,
            blur_screenshots: data.settings.blur_screenshots,
            activity_weight_keyboard: data.settings.activity_weight_keyboard,
            activity_weight_mouse: data.settings.activity_weight_mouse,
            activity_weight_movement: data.settings.activity_weight_movement,
            track_keyboard: data.settings.track_keyboard,
            track_mouse: data.settings.track_mouse,
            track_app_usage: data.settings.track_app_usage,
            track_url: data.settings.track_url,
            time_approval_required: data.settings.time_approval_required,
            mfa_required_for_admins: data.settings.mfa_required_for_admins,
            mfa_required_for_managers: data.settings.mfa_required_for_managers,
            expected_daily_work_minutes: data.settings.expected_daily_work_minutes,
            allow_employee_offline_time: data.settings.allow_employee_offline_time,
          }
        : { ...DEFAULTS }
      setForm(next)
      setBaseline(cloneOrgSettings(next))
    } catch {
      setMessage({ type: 'err', text: 'Could not load organization settings.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const weightSum =
    form.activity_weight_keyboard + form.activity_weight_mouse + form.activity_weight_movement
  const weightsValid = Math.abs(weightSum - 1) <= 0.01

  const isDirty = useMemo(
    () => baseline !== null && !orgSettingsEqual(form, baseline),
    [form, baseline]
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!weightsValid) {
      setMessage({
        type: 'err',
        text: 'Activity weights must sum to 1.0 (within 0.01).',
      })
      return
    }
    setSaving(true)
    try {
      const { data } = await api.patch<{ settings: OrgSettings }>('/v1/admin/settings', {
        screenshot_interval_seconds: form.screenshot_interval_seconds,
        screenshot_retention_days: form.screenshot_retention_days,
        blur_screenshots: form.blur_screenshots,
        activity_weight_keyboard: form.activity_weight_keyboard,
        activity_weight_mouse: form.activity_weight_mouse,
        activity_weight_movement: form.activity_weight_movement,
        track_keyboard: form.track_keyboard,
        track_mouse: form.track_mouse,
        track_app_usage: form.track_app_usage,
        track_url: form.track_url,
        time_approval_required: form.time_approval_required,
        mfa_required_for_admins: form.mfa_required_for_admins,
        mfa_required_for_managers: form.mfa_required_for_managers,
        expected_daily_work_minutes: form.expected_daily_work_minutes,
        allow_employee_offline_time: form.allow_employee_offline_time,
      })
      if (data.settings) {
        const saved: OrgSettings = {
          screenshot_interval_seconds: data.settings.screenshot_interval_seconds,
          screenshot_retention_days: data.settings.screenshot_retention_days,
          blur_screenshots: data.settings.blur_screenshots,
          activity_weight_keyboard: data.settings.activity_weight_keyboard,
          activity_weight_mouse: data.settings.activity_weight_mouse,
          activity_weight_movement: data.settings.activity_weight_movement,
          track_keyboard: data.settings.track_keyboard,
          track_mouse: data.settings.track_mouse,
          track_app_usage: data.settings.track_app_usage,
          track_url: data.settings.track_url,
          time_approval_required: data.settings.time_approval_required,
          mfa_required_for_admins: data.settings.mfa_required_for_admins,
          mfa_required_for_managers: data.settings.mfa_required_for_managers,
          expected_daily_work_minutes: data.settings.expected_daily_work_minutes,
          allow_employee_offline_time: data.settings.allow_employee_offline_time,
        }
        setForm(saved)
        setBaseline(cloneOrgSettings(saved))
      } else {
        setBaseline(cloneOrgSettings(form))
      }
      setMessage({ type: 'ok', text: 'Settings saved.' })
    } catch (err: unknown) {
      let text = 'Could not save settings.'
      if (isAxiosError(err)) {
        const d = err.response?.data as { message?: string; code?: string }
        if (d?.message) text = d.message
        if (d?.code === 'INVALID_WEIGHTS') text = d.message ?? text
      }
      setMessage({ type: 'err', text })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsSkeleton />
  }

  return (
    <form onSubmit={handleSave} className={cn('relative', isDirty ? 'pb-32 sm:pb-28' : 'pb-10')}>
      {message ? (
        <p
          className={cn(
            'mb-6 rounded-lg border px-3 py-2 text-sm',
            message.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          )}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      <div className="space-y-10">
        <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Camera className="h-5 w-5 text-primary" aria-hidden />
            Screenshots
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture cadence, retention, and default blur for new uploads.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ss_interval">Interval (seconds)</Label>
              <Input
                id="ss_interval"
                type="number"
                min={60}
                max={3600}
                className="mt-1"
                value={form.screenshot_interval_seconds}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    screenshot_interval_seconds:
                      Number(e.target.value) || f.screenshot_interval_seconds,
                  }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">60–3600</p>
            </div>
            <div>
              <Label htmlFor="ss_retention">Retention (days)</Label>
              <Input
                id="ss_retention"
                type="number"
                min={7}
                max={365}
                className="mt-1"
                value={form.screenshot_retention_days}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    screenshot_retention_days:
                      Number(e.target.value) || f.screenshot_retention_days,
                  }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">7–365</p>
            </div>
          </div>
          <div className="mt-4">
            <SwitchRow
              id="blur_ss"
              label="Blur screenshots by default (org-wide)"
              checked={form.blur_screenshots}
              onCheckedChange={(blur_screenshots) => setForm((f) => ({ ...f, blur_screenshots }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <BarChart2 className="h-5 w-5 text-primary" aria-hidden />
            Activity weights
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Must sum to 1.0. Current sum: {weightSum.toFixed(3)} {!weightsValid ? '(invalid)' : ''}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="w_kb">Keyboard</Label>
              <Input
                id="w_kb"
                type="number"
                step="0.01"
                min={0}
                max={1}
                className="mt-1"
                value={form.activity_weight_keyboard}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    activity_weight_keyboard: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="w_mouse">Mouse</Label>
              <Input
                id="w_mouse"
                type="number"
                step="0.01"
                min={0}
                max={1}
                className="mt-1"
                value={form.activity_weight_mouse}
                onChange={(e) =>
                  setForm((f) => ({ ...f, activity_weight_mouse: Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <Label htmlFor="w_move">Movement</Label>
              <Input
                id="w_move"
                type="number"
                step="0.01"
                min={0}
                max={1}
                className="mt-1"
                value={form.activity_weight_movement}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    activity_weight_movement: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Sliders className="h-5 w-5 text-primary" aria-hidden />
            Tracking
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            <SwitchRow
              id="tr_kb"
              label="Track keyboard"
              checked={form.track_keyboard}
              onCheckedChange={(track_keyboard) => setForm((f) => ({ ...f, track_keyboard }))}
            />
            <SwitchRow
              id="tr_mouse"
              label="Track mouse"
              checked={form.track_mouse}
              onCheckedChange={(track_mouse) => setForm((f) => ({ ...f, track_mouse }))}
            />
            <SwitchRow
              id="tr_app"
              label="Track app usage"
              checked={form.track_app_usage}
              onCheckedChange={(track_app_usage) => setForm((f) => ({ ...f, track_app_usage }))}
            />
            <SwitchRow
              id="tr_url"
              label="Track URLs"
              checked={form.track_url}
              onCheckedChange={(track_url) => setForm((f) => ({ ...f, track_url }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Clock className="h-5 w-5 text-primary" aria-hidden />
            Time & offline
          </h2>
          <div className="mt-4 space-y-3">
            <SwitchRow
              id="time_appr"
              label="Require time approval"
              checked={form.time_approval_required}
              onCheckedChange={(time_approval_required) =>
                setForm((f) => ({ ...f, time_approval_required }))
              }
            />
            <SwitchRow
              id="allow_offline"
              label="Allow employees to add their own offline time (unless overridden per user)"
              checked={form.allow_employee_offline_time}
              onCheckedChange={(allow_employee_offline_time) =>
                setForm((f) => ({ ...f, allow_employee_offline_time }))
              }
            />
            <div className="pt-2">
              <Label htmlFor="expected_daily">Expected daily work (minutes)</Label>
              <Input
                id="expected_daily"
                type="number"
                min={15}
                max={1440}
                className="mt-1 max-w-xs"
                value={form.expected_daily_work_minutes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expected_daily_work_minutes:
                      Number(e.target.value) || f.expected_daily_work_minutes,
                  }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used for dashboard progress (15–1440).
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Shield className="h-5 w-5 text-primary" aria-hidden />
            MFA requirements
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            <SwitchRow
              id="mfa_admins"
              label="Require MFA for admins"
              checked={form.mfa_required_for_admins}
              onCheckedChange={(mfa_required_for_admins) =>
                setForm((f) => ({ ...f, mfa_required_for_admins }))
              }
            />
            <SwitchRow
              id="mfa_mgr"
              label="Require MFA for managers"
              checked={form.mfa_required_for_managers}
              onCheckedChange={(mfa_required_for_managers) =>
                setForm((f) => ({ ...f, mfa_required_for_managers }))
              }
            />
          </div>
        </section>
      </div>

      {isDirty ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 sm:px-6 md:left-60"
          role="region"
          aria-label="Unsaved changes"
        >
          <div className="pointer-events-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/80">
            <p className="hidden text-xs text-muted-foreground sm:block">
              You have unsaved changes. Save applies organization-wide. Weights must total 1.0.
            </p>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  if (baseline) {
                    setForm(cloneOrgSettings(baseline))
                    setMessage(null)
                  }
                }}
              >
                Discard changes
              </Button>
              <Button type="submit" disabled={saving || !weightsValid}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}
