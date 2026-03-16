'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Loader2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const settingsSchema = z
  .object({
    screenshot_interval_seconds: z.coerce.number().int().min(60).max(3600),
    screenshot_retention_days: z.coerce.number().int().min(7).max(365),
    blur_screenshots: z.boolean(),
    activity_weight_keyboard: z.coerce.number().min(0).max(1),
    activity_weight_mouse: z.coerce.number().min(0).max(1),
    activity_weight_movement: z.coerce.number().min(0).max(1),
    time_approval_required: z.boolean(),
    mfa_required_for_admins: z.boolean(),
    mfa_required_for_managers: z.boolean(),
  })
  .refine(
    (d) => Math.abs(d.activity_weight_keyboard + d.activity_weight_mouse + d.activity_weight_movement - 1) <= 0.01,
    { message: 'Activity weights must sum to 1.0', path: ['activity_weight_keyboard'] },
  )

type SettingsForm = z.infer<typeof settingsSchema>

export default function SettingsPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const token = (session as { access_token?: string })?.access_token

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      screenshot_interval_seconds: 300,
      screenshot_retention_days: 30,
      blur_screenshots: false,
      activity_weight_keyboard: 0.5,
      activity_weight_mouse: 0.3,
      activity_weight_movement: 0.2,
      time_approval_required: false,
      mfa_required_for_admins: false,
      mfa_required_for_managers: false,
    },
  })

  useEffect(() => {
    async function fetchSettings() {
      if (!token) return
      const res = await fetch(`${API_URL}/v1/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const { settings } = await res.json()
        if (settings) form.reset(settings)
      }
      setLoading(false)
    }
    fetchSettings()
  }, [token, form])

  async function onSubmit(data: SettingsForm) {
    if (!token) return
    const res = await fetch(`${API_URL}/v1/admin/settings`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = form

  const totalWeight = (
    (watch('activity_weight_keyboard') || 0) +
    (watch('activity_weight_mouse') || 0) +
    (watch('activity_weight_movement') || 0)
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Organization Settings</h1>
          <p className="text-muted-foreground text-sm">Configure your workspace preferences</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Screenshots */}
        <section className="p-4 rounded-xl border border-border/50 bg-surface/50 space-y-4">
          <h2 className="font-semibold text-sm">Screenshot Settings</h2>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Capture interval (seconds) — {watch('screenshot_interval_seconds')}s
            </label>
            <input
              type="range"
              min={60}
              max={3600}
              step={60}
              {...register('screenshot_interval_seconds')}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>1 min</span><span>1 hour</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Retention period (days) — {watch('screenshot_retention_days')} days
            </label>
            <input
              type="range"
              min={7}
              max={365}
              step={1}
              {...register('screenshot_retention_days')}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>7 days</span><span>1 year</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('blur_screenshots')} className="rounded accent-indigo-500" />
            <span className="text-sm">Blur all screenshots</span>
          </label>
        </section>

        {/* Activity weights */}
        <section className="p-4 rounded-xl border border-border/50 bg-surface/50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Activity Score Weights</h2>
            <span className={`text-xs font-mono ${Math.abs(totalWeight - 1) > 0.01 ? 'text-red-400' : 'text-emerald-400'}`}>
              Sum: {totalWeight.toFixed(2)}
            </span>
          </div>
          {errors.activity_weight_keyboard && (
            <p className="text-xs text-red-400">{errors.activity_weight_keyboard.message}</p>
          )}

          {(
            [
              { key: 'activity_weight_keyboard' as const, label: 'Keyboard' },
              { key: 'activity_weight_mouse' as const, label: 'Mouse Clicks' },
              { key: 'activity_weight_movement' as const, label: 'Mouse Movement' },
            ] as const
          ).map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground block mb-1">
                {label} — {(watch(key) * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                {...register(key)}
                className="w-full accent-indigo-500"
              />
            </div>
          ))}
        </section>

        {/* Workflow */}
        <section className="p-4 rounded-xl border border-border/50 bg-surface/50 space-y-3">
          <h2 className="font-semibold text-sm">Workflow</h2>
          {[
            { key: 'time_approval_required' as const, label: 'Require manager approval for time sessions' },
            { key: 'mfa_required_for_admins' as const, label: 'Require MFA for admins' },
            { key: 'mfa_required_for_managers' as const, label: 'Require MFA for managers' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register(key)} className="rounded accent-indigo-500" />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save Settings
          </Button>
          {saved && (
            <span className="text-sm text-emerald-400">Settings saved successfully!</span>
          )}
        </div>
      </form>
    </div>
  )
}
