'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { Building2, Camera, Check, Globe, Search, Shield, Sliders, UserCog } from 'lucide-react'
import { api } from '@/lib/api'
import { adminToast } from '@/lib/toast'
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
type MeResponse = {
  user?: { org_name?: string }
  org?: { name?: string; timezone?: string }
}

const DEFAULTS: OrgSettings = {
  screenshot_interval_seconds: 60,
  screenshot_retention_days: 270,
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

function getUtcOffsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    if (raw === 'GMT' || raw === 'UTC') return 'UTC+00:00'
    const normalized = raw.replace('GMT', 'UTC')
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/)
    if (!match) return normalized
    const [, sign, h, m = '00'] = match
    return `UTC${sign}${h.padStart(2, '0')}:${m}`
  } catch {
    return 'UTC+00:00'
  }
}

function getUtcOffsetMinutes(timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    if (raw === 'GMT' || raw === 'UTC') return 0
    const normalized = raw.replace('GMT', 'UTC')
    const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/)
    if (!match) return 0
    const sign = match[1] === '-' ? -1 : 1
    const hours = Number(match[2])
    const minutes = Number(match[3] ?? '0')
    return sign * (hours * 60 + minutes)
  } catch {
    return 0
  }
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
          .get<MeResponse>('/v1/app/auth/me')
          .then((r) => ({
            data: {
              org: {
                name: r.data.org?.name ?? r.data.user?.org_name ?? '',
                timezone: r.data.org?.timezone ?? 'UTC',
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
      adminToast.error('Could not load organization settings.')
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timezoneOptions = useMemo<{ value: string; label: string }[]>(
    () =>
      (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'])
        .map((tz) => ({
          value: tz,
          label: `${getUtcOffsetLabel(tz)} — ${tz}`,
          offsetMinutes: getUtcOffsetMinutes(tz),
        }))
        .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value))
        .map(({ value, label }) => ({ value, label })),
    []
  )

  const isDirty = org.timezone !== baselineOrg.current.timezone

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await api.patch('/v1/admin/settings', { timezone: org.timezone })
      baselineOrg.current = { ...org }
      onSaved()
    } catch {
      adminToast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isDirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void save()
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [isDirty, org.timezone])

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
            <select
              id="tz-select"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={org.timezone}
              onChange={(e) => setOrg({ ...org, timezone: e.target.value })}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              IANA timezone for scheduled reports and cron.
            </p>
          </div>
        </div>
      </section>
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalMin = Math.round(form.screenshot_interval_seconds / 60)

  const isDirty = form.screenshot_interval_seconds !== baseline.current.screenshot_interval_seconds

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const { data } = await api.patch<{ settings: OrgSettings }>('/v1/admin/settings', {
        screenshot_interval_seconds: form.screenshot_interval_seconds,
      })
      if (data.settings) {
        baseline.current = { ...baseline.current, ...data.settings }
        setForm((f) => ({ ...f, ...data.settings }))
      }
      onSaved()
    } catch {
      adminToast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isDirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void save()
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [isDirty, form.screenshot_interval_seconds])

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
              step={1}
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
          <div className="relative mt-2 h-7">
            {INTERVAL_SNAPS.map((s) => {
              const leftPct = ((s - 1) / (60 - 1)) * 100
              return (
                <div
                  key={s}
                  className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
                  style={{ left: `${leftPct}%` }}
                >
                  <div className="mx-auto h-1.5 w-px bg-border" />
                  <span className="block mt-0.5 whitespace-nowrap">{s}m</span>
                </div>
              )
            })}
          </div>
        </div>
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty =
    form.mfa_required_for_admins !== baseline.current.mfa_required_for_admins ||
    form.mfa_required_for_managers !== baseline.current.mfa_required_for_managers ||
    form.time_approval_required !== baseline.current.time_approval_required ||
    form.allow_employee_offline_time !== baseline.current.allow_employee_offline_time

  async function save() {
    if (saving) return
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
      adminToast.error('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isDirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void save()
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [isDirty, form.time_approval_required, form.allow_employee_offline_time])

  return (
    <div className="space-y-6">
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

type OverrideDefaults = Record<string, string>

const OVERRIDE_KEY_META: {
  key: string
  label: string
  section: string
  type: 'boolean' | 'number'
}[] = [
  {
    key: 'ss_capture_enabled',
    label: 'Screenshot capture enabled',
    section: 'Screenshots',
    type: 'boolean',
  },
  {
    key: 'ss_capture_interval_seconds',
    label: 'Screenshot interval (sec)',
    section: 'Screenshots',
    type: 'number',
  },
  {
    key: 'ss_delete_allowed',
    label: 'Allow screenshot deletion',
    section: 'Screenshots',
    type: 'boolean',
  },
  {
    key: 'ss_blur_allowed',
    label: 'Allow screenshot blur',
    section: 'Screenshots',
    type: 'boolean',
  },
  {
    key: 'ss_click_notification_enabled',
    label: 'Click notification on capture',
    section: 'Screenshots',
    type: 'boolean',
  },
  {
    key: 'expected_daily_work_minutes',
    label: 'Expected daily work (min)',
    section: 'Activity',
    type: 'number',
  },
  {
    key: 'jira_connected',
    label: 'Jira connected',
    section: 'Integrations',
    type: 'boolean',
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

function UserOverridePanel({
  userId,
  userName,
  systemDefaults,
}: {
  userId: string
  userName: string
  systemDefaults: OverrideDefaults
}) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ overrides: OverrideRow[] }>(
        `/v1/admin/settings/users/${userId}`
      )
      setOverrides(data.overrides)
    } catch {
      adminToast.error('Could not load overrides for this user.')
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
      try {
        await api.put(`/v1/admin/settings/users/${userId}/${key}`, { value })
        showSaved(key)
      } catch (err: unknown) {
        setOverrides(prev)
        let msg = 'Failed to save override.'
        if (isAxiosError(err)) {
          const d = err.response?.data as { message?: string }
          if (d?.message) msg = d.message
        }
        adminToast.error(msg)
      }
    },
    [userId, overrides, showSaved]
  )

  const deleteOverride = useCallback(
    async (key: string) => {
      const prev = overrides.slice()
      setOverrides((old) => old.filter((o) => o.feature_key !== key))
      try {
        await api.delete(`/v1/admin/settings/users/${userId}/${key}`)
        showSaved(key)
      } catch {
        setOverrides(prev)
        adminToast.error('Failed to revert override.')
      }
    },
    [userId, overrides, showSaved]
  )

  const sections = [...new Set(OVERRIDE_KEY_META.map((m) => m.section))]
  return (
    <div className="relative min-h-[320px] pt-4">
      <h3 className="text-sm font-semibold text-foreground">{userName}</h3>
      <p className="text-xs text-muted-foreground">
        Override org defaults for this user. Changes auto-save.
      </p>
      {loading && overrides.length === 0 ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div
          className={cn('transition-opacity duration-150', loading ? 'opacity-60' : 'opacity-100')}
        >
          {sections.map((section) => (
            <div key={section} className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section}
              </p>
              <div className="space-y-2">
                {OVERRIDE_KEY_META.filter((m) => m.section === section).map((meta) => {
                  const hasOverride = overrideMap.has(meta.key)
                  const systemDefault = systemDefaults[meta.key] ?? ''
                  const currentValue = overrideMap.get(meta.key) ?? systemDefault
                  return (
                    <div
                      key={meta.key}
                      className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">{meta.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Default: {systemDefault}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SaveIndicator visible={savedKey === meta.key} />
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
                              if (!hasOverride) void putOverride(meta.key, systemDefault)
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
                              if (!Number.isFinite(num)) return
                              // Always persist on blur in override mode; currentValue is locally edited.
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
      )}
      {loading && overrides.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center rounded-lg bg-background/25 pt-4">
          <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
            Loading overrides...
          </span>
        </div>
      ) : null}
    </div>
  )
}

function UserOverridesTab({ systemDefaults }: { systemDefaults: OverrideDefaults }) {
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
      adminToast.error('Could not load users.')
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

  useEffect(() => {
    if (users.length === 0) {
      setSelectedUser(null)
      return
    }
    if (!selectedUser || !users.some((u) => u.id === selectedUser.id)) {
      setSelectedUser(users[0])
    }
  }, [users, selectedUser])

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
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
            <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUser(u)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    selectedUser?.id === u.id
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-transparent hover:border-border hover:bg-muted/70'
                  )}
                >
                  <InitialsAvatar name={u.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </button>
              ))}
              {!loadingUsers && users.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No users found</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
          {selectedUser ? (
            <UserOverridePanel
              userId={selectedUser.id}
              userName={selectedUser.name}
              systemDefaults={systemDefaults}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a user to configure overrides.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */

export default function OrganizationSettingsPage() {
  const { loading, form, setForm, org, setOrg, baseline, baselineOrg } = useOrgSettings()

  const onSaved = useCallback(() => adminToast.success('Settings saved'), [])
  const overrideDefaults = useMemo<OverrideDefaults>(
    () => ({
      ss_capture_enabled: 'true',
      ss_capture_interval_seconds: String(form.screenshot_interval_seconds),
      ss_delete_allowed: 'false',
      ss_blur_allowed: String(form.blur_screenshots),
      ss_click_notification_enabled: 'true',
      expected_daily_work_minutes: String(form.expected_daily_work_minutes),
      jira_connected: 'false',
    }),
    [form]
  )

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

      <div className="space-y-10">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Globe className="h-4 w-4" />
            General
          </h2>
          <GeneralTab org={org} setOrg={setOrg} baselineOrg={baselineOrg} onSaved={onSaved} />
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Camera className="h-4 w-4" />
            Screenshots
          </h2>
          <ScreenshotsTab form={form} setForm={setForm} baseline={baseline} onSaved={onSaved} />
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Shield className="h-4 w-4" />
            Security
          </h2>
          <SecurityTab form={form} setForm={setForm} baseline={baseline} onSaved={onSaved} />
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <UserCog className="h-4 w-4" />
            Per-User Overrides
          </h2>
          <UserOverridesTab systemDefaults={overrideDefaults} />
        </section>
      </div>
    </div>
  )
}
