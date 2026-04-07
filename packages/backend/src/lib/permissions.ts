/**
 * Central capability flags for org-scoped authorization.
 * `OWNER` bypasses all checks via `hasPermission` / `requirePermission`.
 *
 * Role hierarchy (highest → lowest):
 *   OWNER > ADMIN > MANAGER > EMPLOYEE > VIEWER
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'

export const Permission = {
  // Settings
  SETTINGS_MANAGE_SS_DURATION: 'settings.manage_ss_duration',
  SETTINGS_MANAGE_BLUR_DELETE: 'settings.manage_blur_delete',
  /** Activity weights, tracking flags, idle, MFA org flags, time approval, expected daily minutes, etc. */
  SETTINGS_MANAGE_ADVANCED: 'settings.manage_advanced',
  /** Billing plan changes — OWNER only. */
  SETTINGS_MANAGE_BILLING: 'settings.manage_billing',
  // Offline time
  OFFLINE_TIME_MANAGE_ORG: 'offline_time.manage_org',
  OFFLINE_TIME_MANAGE_USER: 'offline_time.manage_user',
  // User management
  USERS_ASSIGN_MANAGER: 'users.assign_manager',
  USERS_SUSPEND: 'users.suspend',
  USERS_ROLE_SET_MANAGER: 'users.role_set_manager',
  USERS_ROLE_SET_ADMIN: 'users.role_set_admin',
  /** View / act on behalf of direct reports (scoped). */
  MANAGERS_ACCESS: 'managers.access',
  // Reports
  /** View time and activity reports. Granted to OWNER, ADMIN, MANAGER, VIEWER. */
  REPORTS_VIEW: 'reports.view',
  /** Export report data (CSV/JSON). OWNER and ADMIN only. */
  REPORTS_EXPORT: 'reports.export',
  // Integrations
  /** Connect and delete org integrations. OWNER and ADMIN only. */
  INTEGRATIONS_MANAGE: 'integrations.manage',
  /** Read-only view of connected integrations. OWNER, ADMIN, VIEWER. */
  INTEGRATIONS_VIEW: 'integrations.view',
} as const

export type Permission = (typeof Permission)[keyof typeof Permission]

const OWNER_PERMISSIONS: readonly Permission[] = [
  Permission.SETTINGS_MANAGE_SS_DURATION,
  Permission.SETTINGS_MANAGE_BLUR_DELETE,
  Permission.SETTINGS_MANAGE_ADVANCED,
  Permission.SETTINGS_MANAGE_BILLING,
  Permission.OFFLINE_TIME_MANAGE_ORG,
  Permission.OFFLINE_TIME_MANAGE_USER,
  Permission.USERS_ASSIGN_MANAGER,
  Permission.USERS_SUSPEND,
  Permission.USERS_ROLE_SET_MANAGER,
  Permission.USERS_ROLE_SET_ADMIN,
  Permission.MANAGERS_ACCESS,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_EXPORT,
  Permission.INTEGRATIONS_MANAGE,
  Permission.INTEGRATIONS_VIEW,
]

const ADMIN_PERMISSIONS: readonly Permission[] = [
  Permission.SETTINGS_MANAGE_SS_DURATION,
  Permission.SETTINGS_MANAGE_BLUR_DELETE,
  Permission.SETTINGS_MANAGE_ADVANCED,
  Permission.OFFLINE_TIME_MANAGE_ORG,
  Permission.OFFLINE_TIME_MANAGE_USER,
  Permission.USERS_ASSIGN_MANAGER,
  Permission.USERS_SUSPEND,
  Permission.USERS_ROLE_SET_MANAGER,
  Permission.USERS_ROLE_SET_ADMIN,
  Permission.MANAGERS_ACCESS,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_EXPORT,
  Permission.INTEGRATIONS_MANAGE,
  Permission.INTEGRATIONS_VIEW,
]

const MANAGER_PERMISSIONS: readonly Permission[] = [
  Permission.MANAGERS_ACCESS,
  Permission.OFFLINE_TIME_MANAGE_USER,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_EXPORT,
]

const VIEWER_PERMISSIONS: readonly Permission[] = [
  Permission.REPORTS_VIEW,
  Permission.INTEGRATIONS_VIEW,
]

const ROLE_PERMISSIONS: Record<string, readonly Permission[] | undefined> = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  EMPLOYEE: [],
  VIEWER: VIEWER_PERMISSIONS,
}

/** OrgSettings PATCH keys → required permission (granular admin controls). */
export const SETTINGS_PATCH_KEY_PERMISSION: Partial<Record<string, Permission>> = {
  screenshot_interval_seconds: Permission.SETTINGS_MANAGE_SS_DURATION,
  screenshot_retention_days: Permission.SETTINGS_MANAGE_SS_DURATION,
  blur_screenshots: Permission.SETTINGS_MANAGE_BLUR_DELETE,
  allow_employee_offline_time: Permission.OFFLINE_TIME_MANAGE_ORG,
  activity_weight_keyboard: Permission.SETTINGS_MANAGE_ADVANCED,
  activity_weight_mouse: Permission.SETTINGS_MANAGE_ADVANCED,
  activity_weight_movement: Permission.SETTINGS_MANAGE_ADVANCED,
  track_keyboard: Permission.SETTINGS_MANAGE_ADVANCED,
  track_mouse: Permission.SETTINGS_MANAGE_ADVANCED,
  track_app_usage: Permission.SETTINGS_MANAGE_ADVANCED,
  track_url: Permission.SETTINGS_MANAGE_ADVANCED,
  time_approval_required: Permission.SETTINGS_MANAGE_ADVANCED,
  mfa_required_for_admins: Permission.SETTINGS_MANAGE_ADVANCED,
  mfa_required_for_managers: Permission.SETTINGS_MANAGE_ADVANCED,
  expected_daily_work_minutes: Permission.SETTINGS_MANAGE_ADVANCED,
  idle_detection_enabled: Permission.SETTINGS_MANAGE_ADVANCED,
  idle_timeout_minutes: Permission.SETTINGS_MANAGE_ADVANCED,
  idle_timeout_intervals: Permission.SETTINGS_MANAGE_ADVANCED,
  work_platform: Permission.SETTINGS_MANAGE_ADVANCED,
}

export interface AuthPrincipal {
  id: string
  org_id: string
  role: string
}

export function isOwnerRole(role: string): boolean {
  return role === 'OWNER'
}

/** @deprecated Use isOwnerRole instead. Kept for callsites during migration. */
export function isSuperAdminRole(role: string): boolean {
  return role === 'OWNER'
}

/**
 * Org-facing lists and aggregates: hide OWNER accounts from peers, except each user always sees themselves.
 */
export function userWhereVisibleToOrgPeers(principal: AuthPrincipal): Prisma.UserWhereInput {
  return {
    OR: [{ id: principal.id }, { role: { not: 'OWNER' } }],
  }
}

export function hasPermission(principal: AuthPrincipal, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[principal.role]
  return granted?.includes(permission) ?? false
}

/** Users who may query another org member's data (before direct-report scope). */
export function mayActAsPeopleManager(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER'
}

/** Self, full org (ADMIN/OWNER), or direct report (MANAGER). Hidden: other OWNER subjects for non-OWNER principals. */
export async function canAccessOrgUser(
  principal: AuthPrincipal,
  subjectUserId: string
): Promise<boolean> {
  if (principal.id === subjectUserId) return true

  const subject = await prisma.user.findFirst({
    where: { id: subjectUserId, org_id: principal.org_id },
    select: { id: true, role: true, manager_id: true },
  })
  if (!subject) return false

  const subjectRole = subject.role as string
  if (isOwnerRole(subjectRole) && !isOwnerRole(principal.role)) {
    return false
  }

  if (principal.role === 'OWNER' || principal.role === 'ADMIN') {
    return true
  }

  if (principal.role === 'MANAGER') {
    return subject.manager_id === principal.id
  }

  return false
}

/** Intersect requested user IDs with those the principal may access. */
export async function filterAccessibleUserIds(
  principal: AuthPrincipal,
  userIds: string[]
): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return []

  if (principal.role === 'OWNER' || principal.role === 'ADMIN') {
    const rows = await prisma.user.findMany({
      where: { id: { in: unique }, org_id: principal.org_id },
      select: { id: true, role: true },
    })
    return rows
      .filter(
        (r) =>
          principal.id === r.id || !isOwnerRole(r.role as string) || isOwnerRole(principal.role)
      )
      .map((r) => r.id)
  }

  if (principal.role === 'MANAGER') {
    const rows = await prisma.user.findMany({
      where: {
        id: { in: unique },
        org_id: principal.org_id,
        OR: [{ id: principal.id }, { manager_id: principal.id }],
      },
      select: { id: true, role: true },
    })
    return rows
      .filter(
        (r) =>
          principal.id === r.id || !isOwnerRole(r.role as string) || isOwnerRole(principal.role)
      )
      .map((r) => r.id)
  }

  // EMPLOYEE and VIEWER: self only
  return unique.filter((id) => id === principal.id)
}

/** For filtering sessions/reports: self + direct reports (managers). */
export async function managerScopedUserIds(principal: AuthPrincipal): Promise<string[]> {
  if (principal.role !== 'MANAGER') return []
  const reports = await prisma.user.findMany({
    where: {
      org_id: principal.org_id,
      manager_id: principal.id,
      role: { not: 'OWNER' },
    },
    select: { id: true },
  })
  return [principal.id, ...reports.map((r) => r.id)]
}

const MANAGER_ROLE_IDS = new Set(['MANAGER', 'ADMIN', 'OWNER'])

/** Valid assignable manager: active org member with a management-capable role. Non-OWNER callers cannot assign an OWNER as manager. */
export async function getValidManagerAssignee(
  orgId: string,
  managerUserId: string | null,
  callerRole: string
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (managerUserId === null) return { ok: true }
  const m = await prisma.user.findFirst({
    where: { id: managerUserId, org_id: orgId, status: 'ACTIVE' },
    select: { id: true, role: true },
  })
  if (!m) {
    return { ok: false, code: 'NOT_FOUND', message: 'Manager user not found' }
  }
  const mRole = m.role as string
  if (!MANAGER_ROLE_IDS.has(mRole)) {
    return {
      ok: false,
      code: 'INVALID_MANAGER',
      message: 'Manager must be an ADMIN, OWNER, or MANAGER',
    }
  }
  if (isOwnerRole(mRole) && !isOwnerRole(callerRole)) {
    return {
      ok: false,
      code: 'INVALID_MANAGER',
      message: 'Cannot assign an OWNER as manager',
    }
  }
  return { ok: true }
}

/** True if assigning `reportUserId` to report to `proposedManagerId` would create a cycle in the manager chain. */
export async function wouldCreateManagerCycle(
  reportUserId: string,
  proposedManagerId: string,
  orgId: string
): Promise<boolean> {
  let current: string | null = proposedManagerId
  const seen = new Set<string>()
  while (current) {
    if (current === reportUserId) return true
    if (seen.has(current)) break
    seen.add(current)
    const row: { manager_id: string | null } | null = await prisma.user.findFirst({
      where: { id: current, org_id: orgId },
      select: { manager_id: true },
    })
    current = row?.manager_id ?? null
  }
  return false
}

/**
 * Returns the set of roles a given role is allowed to invite.
 * OWNER can invite any non-OWNER role.
 * ADMIN can invite MANAGER, EMPLOYEE, VIEWER.
 * MANAGER can invite EMPLOYEE, VIEWER.
 */
export function getAllowedInviteRoles(callerRole: string): string[] {
  switch (callerRole) {
    case 'OWNER':
      return ['ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']
    case 'ADMIN':
      return ['MANAGER', 'EMPLOYEE', 'VIEWER']
    case 'MANAGER':
      return ['EMPLOYEE', 'VIEWER']
    default:
      return []
  }
}
