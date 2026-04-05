import type { PrismaClient } from '@prisma/client'
import { prisma } from '../db/prisma.js'

/** System defaults (tier 3). Serialized values in overrides use the same string form. */
export const OVERRIDABLE_KEYS = {
  ss_capture_interval_seconds: 600,
  ss_capture_enabled: true,
  ss_delete_allowed: false,
  ss_blur_allowed: false,
  ss_click_notification_enabled: true,
  jira_connected: false,
  expected_daily_work_minutes: 480,
} as const

export type OverridableKey = keyof typeof OVERRIDABLE_KEYS

export function isOverridableKey(key: string): key is OverridableKey {
  return Object.prototype.hasOwnProperty.call(OVERRIDABLE_KEYS, key)
}

function serializeDefault(v: boolean | number): string {
  return typeof v === 'boolean' ? String(v) : String(v)
}

/**
 * Three-tier resolution:
 * 1. UserSettingsOverride for [org_id, user_id, feature_key]
 * 2. OrgSettings (and Integration for jira_connected) where applicable
 * 3. OVERRIDABLE_KEYS
 */
export async function resolveFeature(
  orgId: string,
  userId: string,
  key: OverridableKey,
  db: Pick<PrismaClient, 'userSettingsOverride' | 'orgSettings' | 'integration'> = prisma
): Promise<string> {
  const override = await db.userSettingsOverride.findUnique({
    where: {
      org_id_user_id_feature_key: {
        org_id: orgId,
        user_id: userId,
        feature_key: key,
      },
    },
  })
  if (override) {
    return override.value
  }

  switch (key) {
    case 'jira_connected': {
      const jira = await db.integration.findFirst({
        where: { org_id: orgId, type: 'jira', status: 'active' },
        select: { id: true },
      })
      return String(!!jira)
    }
    case 'ss_capture_interval_seconds':
    case 'ss_blur_allowed':
    case 'expected_daily_work_minutes': {
      const orgSettings = await db.orgSettings.findUnique({
        where: { org_id: orgId },
      })
      if (orgSettings) {
        if (key === 'ss_capture_interval_seconds') {
          return String(orgSettings.screenshot_interval_seconds)
        }
        if (key === 'ss_blur_allowed') {
          return String(orgSettings.blur_screenshots)
        }
        return String(orgSettings.expected_daily_work_minutes)
      }
      break
    }
    default:
      break
  }

  return serializeDefault(OVERRIDABLE_KEYS[key])
}
