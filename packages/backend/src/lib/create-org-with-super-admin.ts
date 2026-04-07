import type { Prisma } from '@prisma/client'
import {
  GLOBAL_SCREENSHOT_RETENTION_DAYS,
  type OrgSettingsScalarPatch,
  type WorkPlatform,
} from './org-settings-fields.js'

export const DISPOSABLE_SIGNUP_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwam.com',
  'yopmail.com',
]

export function isDisposableSignupEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return !!(domain && DISPOSABLE_SIGNUP_DOMAINS.includes(domain))
}

export async function createOrgWithSuperAdmin(
  tx: Prisma.TransactionClient,
  input: {
    org_name: string
    slug: string
    full_name: string
    email: string
    password_hash: string
    data_region?: string
    work_platform?: WorkPlatform
    settings?: OrgSettingsScalarPatch
  }
): Promise<{ orgId: string; userId: string }> {
  const emailLower = input.email.toLowerCase()
  if (isDisposableSignupEmail(emailLower)) {
    throw Object.assign(new Error('DISPOSABLE_EMAIL'), { code: 'DISPOSABLE_EMAIL' as const })
  }

  const org = await tx.organization.create({
    data: {
      name: input.org_name,
      slug: input.slug.toLowerCase(),
      data_region: input.data_region || 'us-east-1',
    },
  })
  const { work_platform: wpFromSettings, ...settingsRest } = input.settings ?? {}
  const work_platform = input.work_platform ?? wpFromSettings ?? 'jira_cloud'
  const settingsData = Object.fromEntries(
    Object.entries(settingsRest).filter(([k, v]) => v !== undefined && k !== 'org_id' && k !== 'id')
  )

  await tx.orgSettings.create({
    data: {
      org_id: org.id,
      work_platform,
      ...(settingsData as Omit<Prisma.OrgSettingsUncheckedCreateInput, 'org_id' | 'work_platform'>),
      screenshot_retention_days: GLOBAL_SCREENSHOT_RETENTION_DAYS,
    },
  })
  const user = await tx.user.create({
    data: {
      org_id: org.id,
      email: emailLower,
      password_hash: input.password_hash,
      name: input.full_name,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  })
  return { orgId: org.id, userId: user.id }
}
