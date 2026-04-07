import { z } from 'zod'
import type { OrgSettings } from '@prisma/client'

export const WORK_PLATFORMS = ['none', 'asana', 'jira_cloud', 'jira_self_hosted'] as const
export type WorkPlatform = (typeof WORK_PLATFORMS)[number]

export const workPlatformSchema = z.enum(WORK_PLATFORMS)
export const GLOBAL_SCREENSHOT_RETENTION_DAYS = 270

/** Same bounds as admin PATCH — use for platform org create `settings` body. */
export const orgSettingsScalarPatchSchema = z.object({
  screenshot_interval_seconds: z.number().int().min(60).max(3600).optional(),
  screenshot_retention_days: z.number().int().min(7).max(365).optional(),
  blur_screenshots: z.boolean().optional(),
  activity_weight_keyboard: z.number().min(0).max(1).optional(),
  activity_weight_mouse: z.number().min(0).max(1).optional(),
  activity_weight_movement: z.number().min(0).max(1).optional(),
  track_keyboard: z.boolean().optional(),
  track_mouse: z.boolean().optional(),
  track_app_usage: z.boolean().optional(),
  track_url: z.boolean().optional(),
  time_approval_required: z.boolean().optional(),
  mfa_required_for_admins: z.boolean().optional(),
  mfa_required_for_managers: z.boolean().optional(),
  expected_daily_work_minutes: z.number().int().min(15).max(1440).optional(),
  allow_employee_offline_time: z.boolean().optional(),
  idle_detection_enabled: z.boolean().optional(),
  idle_timeout_minutes: z.number().int().min(1).max(60).optional(),
  idle_timeout_intervals: z.number().int().min(1).max(10).optional(),
  work_platform: workPlatformSchema.optional(),
})

export type OrgSettingsScalarPatch = z.infer<typeof orgSettingsScalarPatchSchema>

export function assertActivityWeightsSum(
  patch: OrgSettingsScalarPatch,
  existing: {
    activity_weight_keyboard: number
    activity_weight_mouse: number
    activity_weight_movement: number
  } | null
): void {
  const {
    activity_weight_keyboard: k,
    activity_weight_mouse: m,
    activity_weight_movement: mv,
  } = patch
  if (k === undefined && m === undefined && mv === undefined) return
  const finalK = k ?? existing?.activity_weight_keyboard ?? 0.5
  const finalM = m ?? existing?.activity_weight_mouse ?? 0.3
  const finalMv = mv ?? existing?.activity_weight_movement ?? 0.2
  const sum = finalK + finalM + finalMv
  if (Math.abs(sum - 1.0) > 0.01) {
    throw Object.assign(
      new Error(`INVALID_WEIGHTS: Activity weights must sum to 1.0, got ${sum.toFixed(3)}`),
      {
        code: 'INVALID_WEIGHTS' as const,
      }
    )
  }
}

/** Subset exposed to app / desktop clients (login, /me, MFA). */
export function toPublicOrgSettings(orgSettings: OrgSettings | null) {
  if (!orgSettings) return null
  return {
    screenshot_interval_seconds: orgSettings.screenshot_interval_seconds,
    screenshot_retention_days: GLOBAL_SCREENSHOT_RETENTION_DAYS,
    blur_screenshots: orgSettings.blur_screenshots,
    time_approval_required: orgSettings.time_approval_required,
    idle_detection_enabled: orgSettings.idle_detection_enabled,
    idle_timeout_minutes: orgSettings.idle_timeout_minutes,
    idle_timeout_intervals: orgSettings.idle_timeout_intervals,
    expected_daily_work_minutes: orgSettings.expected_daily_work_minutes,
    work_platform: orgSettings.work_platform as WorkPlatform,
  }
}
