'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  BarChart2,
  Building2,
  Camera,
  Check,
  Globe,
  Link2,
  Search,
  Shield,
  Sliders,
  UserCog,
} from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { InitialsAvatar } from '@/components/ui/initials-avatar'
import { cn } from '@/lib/utils'

/* ─── Types ──────────────────────────────────────────────────────────────────── */

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

type OrgInfo = { name: string; timezone: string }

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

/* ─── Shared UI ──────────────────────────────────────────────────────────────── */

function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <Label
        htmlFor={id}
        className="cursor-pointer text-sm font-normal leading-snug text-foreground"
      >
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function Toast({ msg, type, onRetry }: { msg: string; type: 'ok' | 'err'; onRetry?: () => void }) {
  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-[300] flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300',
        type === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-destructive/30 bg-destructive/10 text-destructive'
      )}
    >
      {type === 'ok' && <Check className="h-4 w-4 shrink-0" />}
      <span>{msg}</span>
      {type === 'err' && onRetry && (
        <button type="button" onClick={onRetry} className="ml-1 font-medium underline">
          Try again
        </button>
      )}
    </div>
  )
}

const INTERVAL_SNAPS = [1, 5, 10, 15, 30, 60]

function snapToNearest(val: number): number {
  let closest = INTERVAL_SNAPS[0]
  let dist = Math.abs(val - closest)
  for (const s of INTERVAL_SNAPS) {
    const d = Math.abs(val - s)
    if (d < dist) {
      closest = s
      dist = d
    }
  }
  return closest
}

/* ─── Settings hook ──────────────────────────────────────────────────────────── */

function useOrgSettings() {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<OrgSettings>({ ...DEFAULTS })
  const [org, setOrg] = useState<OrgInfo>({ name: '', timezone: 'UTC' })
  const baseline = useRef<OrgSettings>({ ...DEFAULTS })
  const baselineOrg = useRef<OrgInfo>({ name: '', timezone: 'UTC' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, orgRes] = await Promise.all([
        api.get<{ settings: OrgSettings | null }>('/v1/admin/settings'),
        api
          .get<{ org: OrgInfo }>('/v1/app/auth/me')
          .then((r) => ({
            data: {
              org: {
                name: (r.data as { org_name?: string }).org_name ?? '',
                timezone: (r.data as { org_timezone?: string }).org_timezone ?? 'UTC',
              },
            },
          }))
          .catch(() => ({ data: { org: { name: '', timezone: 'UTC' } } })),
      ])
      const s = settingsRes.data.settings ?? DEFAULTS
      const merged: OrgSettings = { ...DEFAULTS, ...s }
      setForm(merged)
      baseline.current = { ...merged }
      const o = orgRes.data.org ?? { name: '', timezone: 'UTC' }
      setOrg(o)
      baselineOrg.current = { ...o }
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { loading, form, setForm, org, setOrg, baseline, baselineOrg, reload: load }
}

/* ─── General Tab ────────────────────────────────────────────────────────────── */

function GeneralTab({
  org,
  setOrg,
  baselineOrg,
  onSaved,
}: {
  org: OrgInfo
  setOrg: (o: OrgInfo) => void
  baselineOrg: React.MutableRefObject<OrgInfo>
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)

  const isDirty = org.timezone !== baselineOrg.current.timezone

  async function save() {
    setSaving(true)
    try {
      await api.patch('/v1/admin/settings', { timezone: org.timezone })
      baselineOrg.current = { ...org }
      onSaved()
    } catch {
      /* handled via toast */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Building2 className="h-5 w-5 text-primary" />
          Organization
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Organization name</Label>
            <Input className="mt-1" value={org.name} disabled />
            <p className="mt-1 text-xs text-muted-foreground">
              Contact support to change org name.
            </p>
          </div>
          <div>
            <Label htmlFor="tz-select">Timezone</Label>
            <Input
              id="tz-select"
              className="mt-1"
              value={org.timezone}
              onChange={(e) => setOrg({ ...org, timezone: e.target.value })}
              placeholder="e.g. America/New_York"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              IANA timezone for scheduled reports and cron.
            </p>
          </div>
        </div>
      </section>

      {isDirty && (
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save General'}
        </Button>
      )}
    </div>
  )
}

/* ─── Screenshots Tab ────────────────────────────────────────────────────────── */

function ScreenshotsTab({
  form,
  setForm,
  baseline,
  onSaved,
}: {
  form: OrgSettings
  setForm: React.Dispatch<React.SetStateAction<OrgSettings>>
  baseline: React.MutableRefObject<OrgSettings>
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const intervalMin = Math.round(form.screenshot_interval_seconds / 60)

  const isDirty =
    form.screenshot_interval_seconds !== baseline.current.screenshot_interval_seconds ||
    form.screenshot_retention_days !== baseline.current.screenshot_retention_days ||
    form.blur_screenshots !== baseline.current.blur_screenshots

  async function save() {
    setSaving(true)
    try {
      const { data } = await api.patch<{ settings: OrgSettings }>('/v1/admin/settings', {
        screenshot_interval_seconds: form.screenshot_interval_seconds,
        screenshot_retention_days: form.screenshot_retention_days,
        blur_screenshots: form.blur_screenshots,
      })
      if (data.settings) {
        baseline.current = { ...baseline.current, ...data.settings }
        setForm((f) => ({ ...f, ...data.settings }))
      }
      onSaved()
    } catch {
      /* noop */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Camera className="h-5 w-5 text-primary" />
          Screenshot Capture
        </h2>

        <div className="mt-4">
          <Label>Capture interval</Label>
          <div className="mt-2 flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={60}
              value={intervalMin}
              onChange={(e) => {
                const snapped = snapToNearest(Number(e.target.value))
                setForm((f) => ({ ...f, screenshot_interval_seconds: snapped * 60 }))
              }}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <span className="w-24 text-right font-mono text-sm tabular-nums text-foreground">
              {intervalMin} minute{intervalMin !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            {INTERVAL_SNAPS.map((s) => (
              <span key={s}>{s}m</span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <Label htmlFor="ss_ret">Retention (days)</Label>
          <Input
            id="ss_ret"
            type="number"
            min={7}
            max={365}
            className="mt-1 max-w-xs"
            value={form.screenshot_retention_days}
            onChange={(e) =>
              setForm((f) => ({ ...f, screenshot_retention_days: Number(e.target.value) || 30 }))
            }
          />
        </div>

        <div className="mt-6 space-y-2">
          <SwitchRow
            id="blur_ss"
            label="Blur screenshots by default"
            checked={form.blur_screenshots}
            onCheckedChange={(v) => setForm((f) => ({ ...f, blur_screenshots: v }))}
          />
        </div>
      </section>

      {isDirty && (
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save Screenshots'}
        </Button>
      )}
    </div>
  )
}

/* ─── Activity Tab ───────────────────────────────────────────────────────────── */

function ActivityTab({
  form,
  setForm,
  baseline,
  onSaved,
}: {
  form: OrgSettings
  setForm: React.Dispatch<React.SetStateAction<OrgSettings>>
  baseline: React.MutableRefObject<OrgSettings>
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)

  const kbPct = Math.round(form.activity_weight_keyboard * 100)
  const mPct = Math.round(form.activity_weight_mouse * 100)
  const mvPct = Math.round(form.activity_weight_movement * 100)
  const sum =
    form.activity_weight_keyboard + form.activity_weight_mouse + form.activity_weight_movement
  const valid = Math.abs(sum - 1) <= 0.02

  const isDirty =
    form.activity_weight_keyboard !== baseline.current.activity_weight_keyboard ||
    form.activity_weight_mouse !== baseline.current.activity_weight_mouse ||
    form.activity_weight_movement !== baseline.current.activity_weight_movement ||
    form.track_keyboard !== baseline.current.track_keyboard ||
    form.track_mouse !== baseline.current.track_mouse ||
    form.track_app_usage !== baseline.current.track_app_usage ||
    form.track_url !== baseline.current.track_url ||
    form.expected_daily_work_minutes !== baseline.current.expected_daily_work_minutes

  function setWeight(key: 'keyboard' | 'mouse' | 'movement', val: number) {
    setForm((f) => {
      const updated = { ...f }
      if (key === 'keyboard') updated.activity_weight_keyboard = val / 100
      else if (key === 'mouse') updated.activity_weight_mouse = val / 100
      else updated.activity_weight_movement = val / 100
      return updated
    })
  }

  async function save() {
    setSaving(true)
    try {
      const { data } = await api.patch<{ settings: OrgSettings }>('/v1/admin/settings', {
        activity_weight_keyboard: form.activity_weight_keyboard,
        activity_weight_mouse: form.activity_weight_mouse,
        activity_weight_movement: form.activity_weight_movement,
        track_keyboard: form.track_keyboard,
        track_mouse: form.track_mouse,
        track_app_usage: form.track_app_usage,
        track_url: form.track_url,
        expected_daily_work_minutes: form.expected_daily_work_minutes,
      })
      if (data.settings) {
        baseline.current = { ...baseline.current, ...data.settings }
        setForm((f) => ({ ...f, ...data.settings }))
      }
      onSaved()
    } catch {
      /* noop */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <BarChart2 className="h-5 w-5 text-primary" />
          Activity Weights
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Must sum to 100%. Current: {kbPct + mPct + mvPct}%
          {!valid && <span className="ml-1 text-red-500">(invalid)</span>}
        </p>

        <div className="mt-4 space-y-4">
          {[
            { key: 'keyboard' as const, label: 'Keyboard', val: kbPct },
            { key: 'mouse' as const, label: 'Mouse', val: mPct },
            { key: 'movement' as const, label: 'Movement', val: mvPct },
          ].map(({ key, label, val }) => (
            <div key={key}>
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="font-mono text-sm tabular-nums">{val}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={val}
                onChange={(e) => setWeight(key, Number(e.target.value))}
                className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </div>
          ))}
        </div>

        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          With these weights, 60 keystrokes/min ≈ {Math.round(kbPct * 0.6)}% activity score
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Sliders className="h-5 w-5 text-primary" />
          Tracking & Work
        </h2>
        <div className="mt-4 space-y-2">
          <SwitchRow
            id="tr_kb"
            label="Track keyboard"
            checked={form.track_keyboard}
            onCheckedChange={(v) => setForm((f) => ({ ...f, track_keyboard: v }))}
          />
          <SwitchRow
            id="tr_mouse"
            label="Track mouse"
            checked={form.track_mouse}
            onCheckedChange={(v) => setForm((f) => ({ ...f, track_mouse: v }))}
          />
          <SwitchRow
            id="tr_app"
            label="Track app usage"
            checked={form.track_app_usage}
            onCheckedChange={(v) => setForm((f) => ({ ...f, track_app_usage: v }))}
          />
          <SwitchRow
            id="tr_url"
            label="Track URLs"
            checked={form.track_url}
            onCheckedChange={(v) => setForm((f) => ({ ...f, track_url: v }))}
          />
        </div>
        <div className="mt-4">
          <Label htmlFor="exp_daily">Expected daily work (minutes)</Label>
          <Input
            id="exp_daily"
            type="number"
            min={15}
            max={1440}
            className="mt-1 max-w-xs"
            value={form.expected_daily_work_minutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, expected_daily_work_minutes: Number(e.target.value) || 480 }))
            }
          />
        </div>
      </section>

      {isDirty && (
        <Button onClick={() => void save()} disabled={saving || !valid}>
          {saving ? 'Saving…' : 'Save Activity'}
        </Button>
      )}
    </div>
  )
}

/* ─── Integrations Tab ───────────────────────────────────────────────────────── */

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<{ provider: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ integrations: { provider: string; status: string }[] }>('/v1/integrations')
      .then(({ data }) => setIntegrations(data.integrations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Link2 className="h-5 w-5 text-primary" />
          Integrations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connected integrations and their status.
        </p>
        {loading ? (
          <div className="mt-4 space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : integrations.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No integrations connected. Connect Jira or Asana from the desktop app.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {integrations.map((i) => (
              <div
                key={i.provider}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                    {i.provider.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium capitalize text-foreground">
                    {i.provider}
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    i.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ─── Security Tab ───────────────────────────────────────────────────────────── */

function SecurityTab({
  form,
  setForm,
  baseline,
  onSaved,
}: {
  form: OrgSettings
  setForm: React.Dispatch<React.SetStateAction<OrgSettings>>
  baseline: React.MutableRefObject<OrgSettings>
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)

  const isDirty =
    form.mfa_required_for_admins !== baseline.current.mfa_required_for_admins ||
    form.mfa_required_for_managers !== baseline.current.mfa_required_for_managers ||
    form.time_approval_required !== baseline.current.time_approval_required ||
    form.allow_employee_offline_time !== baseline.current.allow_employee_offline_time

  async function save() {
    setSaving(true)
    try {
      const { data } = await api.patch<{ settings: OrgSettings }>('/v1/admin/settings', {
        mfa_required_for_admins: form.mfa_required_for_admins,
        mfa_required_for_managers: form.mfa_required_for_managers,
        time_approval_required: form.time_approval_required,
        allow_employee_offline_time: form.allow_employee_offline_time,
      })
      if (data.settings) {
        baseline.current = { ...baseline.current, ...data.settings }
        setForm((f) => ({ ...f, ...data.settings }))
      }
      onSaved()
    } catch {
      /* noop */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Shield className="h-5 w-5 text-primary" />
          MFA Requirements
        </h2>
        <div className="mt-4 space-y-2">
          <SwitchRow
            id="mfa_admins"
            label="Require MFA for admins"
            checked={form.mfa_required_for_admins}
            onCheckedChange={(v) => setForm((f) => ({ ...f, mfa_required_for_admins: v }))}
          />
          <SwitchRow
            id="mfa_mgr"
            label="Require MFA for managers"
            checked={form.mfa_required_for_managers}
            onCheckedChange={(v) => setForm((f) => ({ ...f, mfa_required_for_managers: v }))}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/40 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Sliders className="h-5 w-5 text-primary" />
          Time & Offline
        </h2>
        <div className="mt-4 space-y-2">
          <SwitchRow
            id="time_appr"
            label="Require time approval"
            checked={form.time_approval_required}
            onCheckedChange={(v) => setForm((f) => ({ ...f, time_approval_required: v }))}
          />
          <SwitchRow
            id="allow_offline"
            label="Allow employees to add offline time"
            checked={form.allow_employee_offline_time}
            onCheckedChange={(v) => setForm((f) => ({ ...f, allow_employee_offline_time: v }))}
          />
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-border bg-card/40 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-muted-foreground">Session Timeout</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coming soon — configure auto-logout duration for inactive sessions.
        </p>
      </section>

      {isDirty && (
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save Security'}
        </Button>
      )}
    </div>
  )
}

/* ─── Per-User Overrides Tab (preserved from Sprint 2) ───────────────────────── */

type OverrideRow = {
  id: string
  org_id: string
  user_id: string
  feature_key: string
  value: string
}
type UserRow = { id: string; name: string; email: string; role: string; status: string }

const OVERRIDE_KEY_META: {
  key: string
  label: string
  section: string
  type: 'boolean' | 'number'
  systemDefault: string
}[] = [
  {
    key: 'ss_capture_enabled',
    label: 'Screenshot capture enabled',
    section: 'Screenshots',
    type: 'boolean',
    systemDefault: 'true',
  },
  {
    key: 'ss_capture_interval_seconds',
    label: 'Screenshot interval (sec)',
    section: 'Screenshots',
    type: 'number',
    systemDefault: '600',
  },
  {
    key: 'ss_delete_allowed',
    label: 'Allow screenshot deletion',
    section: 'Screenshots',
    type: 'boolean',
    systemDefault: 'false',
  },
  {
    key: 'ss_blur_allowed',
    label: 'Allow screenshot blur',
    section: 'Screenshots',
    type: 'boolean',
    systemDefault: 'false',
  },
  {
    key: 'ss_click_notification_enabled',
    label: 'Click notification on capture',
    section: 'Screenshots',
    type: 'boolean',
    systemDefault: 'true',
  },
  {
    key: 'expected_daily_work_minutes',
    label: 'Expected daily work (min)',
    section: 'Activity',
    type: 'number',
    systemDefault: '480',
  },
  {
    key: 'jira_connected',
    label: 'Jira connected',
    section: 'Integrations',
    type: 'boolean',
    systemDefault: 'false',
  },
]

function SaveIndicator({ visible }: { visible: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-emerald-600 transition-opacity duration-300 dark:text-emerald-400',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      <Check className="h-3.5 w-3.5" /> Saved
    </span>
  )
}

function UserOverridePanel({ userId, userName }: { userId: string; userName: string }) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ overrides: OverrideRow[] }>(
        `/v1/admin/settings/users/${userId}`
      )
      setOverrides(data.overrides)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const overrideMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of overrides) m.set(o.feature_key, o.value)
    return m
  }, [overrides])

  const showSaved = useCallback((key: string) => {
    setSavedKey(key)
    setErrorKey(null)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedKey(null), 1500)
  }, [])

  const putOverride = useCallback(
    async (key: string, value: string) => {
      const prev = overrides.slice()
      setOverrides((old) => {
        const exists = old.find((o) => o.feature_key === key)
        if (exists) return old.map((o) => (o.feature_key === key ? { ...o, value } : o))
        return [...old, { id: '', org_id: '', user_id: userId, feature_key: key, value }]
      })
      setErrorKey(null)
      try {
        await api.put(`/v1/admin/settings/users/${userId}/${key}`, { value })
        showSaved(key)
      } catch (err: unknown) {
        setOverrides(prev)
        setErrorKey(key)
        let msg = 'Failed to save'
        if (isAxiosError(err)) {
          const d = err.response?.data as { message?: string }
          if (d?.message) msg = d.message
        }
        setErrorMsg(msg)
      }
    },
    [userId, overrides, showSaved]
  )

  const deleteOverride = useCallback(
    async (key: string) => {
      const prev = overrides.slice()
      setOverrides((old) => old.filter((o) => o.feature_key !== key))
      setErrorKey(null)
      try {
        await api.delete(`/v1/admin/settings/users/${userId}/${key}`)
        showSaved(key)
      } catch {
        setOverrides(prev)
        setErrorKey(key)
        setErrorMsg('Failed to revert')
      }
    },
    [userId, overrides, showSaved]
  )

  if (loading)
    return (
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )

  const sections = [...new Set(OVERRIDE_KEY_META.map((m) => m.section))]
  return (
    <div className="pt-4">
      <h3 className="text-sm font-semibold text-foreground">{userName}</h3>
      <p className="text-xs text-muted-foreground">
        Override org defaults for this user. Changes auto-save.
      </p>
      {sections.map((section) => (
        <div key={section} className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section}
          </p>
          <div className="space-y-2">
            {OVERRIDE_KEY_META.filter((m) => m.section === section).map((meta) => {
              const hasOverride = overrideMap.has(meta.key)
              const currentValue = overrideMap.get(meta.key) ?? meta.systemDefault
              return (
                <div
                  key={meta.key}
                  className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{meta.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Default: {meta.systemDefault}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SaveIndicator visible={savedKey === meta.key} />
                      {errorKey === meta.key && (
                        <span className="text-[10px] text-red-500">{errorMsg}</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name={`mode-${meta.key}`}
                        checked={!hasOverride}
                        onChange={() => {
                          if (hasOverride) void deleteOverride(meta.key)
                        }}
                        className="accent-primary"
                      />
                      Use org default
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name={`mode-${meta.key}`}
                        checked={hasOverride}
                        onChange={() => {
                          if (!hasOverride) void putOverride(meta.key, meta.systemDefault)
                        }}
                        className="accent-primary"
                      />
                      Override
                    </label>
                    {hasOverride && meta.type === 'boolean' && (
                      <Switch
                        checked={currentValue === 'true'}
                        onCheckedChange={(v) => void putOverride(meta.key, String(v))}
                        className="ml-auto"
                      />
                    )}
                    {hasOverride && meta.type === 'number' && (
                      <Input
                        type="number"
                        className="ml-auto w-28"
                        value={currentValue}
                        onBlur={(e) => {
                          const num = Number(e.target.value)
                          if (Number.isFinite(num) && String(num) !== currentValue)
                            void putOverride(meta.key, String(num))
                        }}
                        onChange={(e) =>
                          setOverrides((old) =>
                            old.map((o) =>
                              o.feature_key === meta.key ? { ...o, value: e.target.value } : o
                            )
                          )
                        }
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function UserOverridesTab() {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchUsers = useCallback(async (q: string) => {
    setLoadingUsers(true)
    try {
      const { data } = await api.get<{ users: UserRow[] }>('/v1/admin/users', {
        params: { search: q, limit: 20 },
      })
      setUsers(data.users ?? [])
    } catch {
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    void searchUsers('')
  }, [searchUsers])
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void searchUsers(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, searchUsers])

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      {loadingUsers ? (
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedUser(u)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                selectedUser?.id === u.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted/70'
              )}
            >
              <InitialsAvatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}</p>
                <p
                  className={cn(
                    'truncate text-xs',
                    selectedUser?.id === u.id
                      ? 'text-primary-foreground/70'
                      : 'text-muted-foreground'
                  )}
                >
                  {u.email}
                </p>
              </div>
            </button>
          ))}
          {!loadingUsers && users.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No users found</p>
          )}
        </div>
      )}
      {selectedUser && (
        <UserOverridePanel
          key={selectedUser.id}
          userId={selectedUser.id}
          userName={selectedUser.name}
        />
      )}
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */

const TAB_ITEMS: { key: string; label: string; icon: typeof Building2 }[] = [
  { key: 'general', label: 'General', icon: Globe },
  { key: 'screenshots', label: 'Screenshots', icon: Camera },
  { key: 'activity', label: 'Activity', icon: BarChart2 },
  { key: 'integrations', label: 'Integrations', icon: Link2 },
  { key: 'overrides', label: 'Per-User Overrides', icon: UserCog },
  { key: 'security', label: 'Security', icon: Shield },
]

export default function OrganizationSettingsPage() {
  const [tab, setTab] = useState('general')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { loading, form, setForm, org, setOrg, baseline, baselineOrg, reload } = useOrgSettings()

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const onSaved = useCallback(() => showToast('Settings saved', 'ok'), [])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Organization Settings</h1>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="mb-6 flex flex-wrap border-b border-border">
          {TAB_ITEMS.map((t) => {
            const Icon = t.icon
            return (
              <Tabs.Trigger
                key={t.key}
                value={t.key}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </Tabs.Trigger>
            )
          })}
        </Tabs.List>

        <Tabs.Content value="general">
          <GeneralTab org={org} setOrg={setOrg} baselineOrg={baselineOrg} onSaved={onSaved} />
        </Tabs.Content>
        <Tabs.Content value="screenshots">
          <ScreenshotsTab form={form} setForm={setForm} baseline={baseline} onSaved={onSaved} />
        </Tabs.Content>
        <Tabs.Content value="activity">
          <ActivityTab form={form} setForm={setForm} baseline={baseline} onSaved={onSaved} />
        </Tabs.Content>
        <Tabs.Content value="integrations">
          <IntegrationsTab />
        </Tabs.Content>
        <Tabs.Content value="overrides">
          <UserOverridesTab />
        </Tabs.Content>
        <Tabs.Content value="security">
          <SecurityTab form={form} setForm={setForm} baseline={baseline} onSaved={onSaved} />
        </Tabs.Content>
      </Tabs.Root>

      {toast && (
        <Toast
          msg={toast.msg}
          type={toast.type}
          onRetry={toast.type === 'err' ? () => void reload() : undefined}
        />
      )}
    </div>
  )
}
