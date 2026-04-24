/** Organization roles from session.user.role (canonical lowercase snake_case for UI checks). */

/**
 * Map Prisma `UserRole` (and legacy API values) to the strings used across the landing app.
 * Login returns enum names like `OWNER`; older data used `super_admin`.
 */
export function normalizeOrgRole(role: string | undefined): string | undefined {
  if (role == null || role === '') return undefined
  const key = role.toUpperCase()
  const map: Record<string, string> = {
    OWNER: 'super_admin',
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    EMPLOYEE: 'employee',
    VIEWER: 'viewer',
  }
  return map[key] ?? role
}

/**
 * Human-readable label for org-member roles (badges, invites, admin tables).
 * `normalizeOrgRole` maps `OWNER` → internal `super_admin` for legacy permission checks; this is product-facing copy only.
 */
export function orgMemberRoleDisplayLabel(role: string | undefined | null): string {
  const normalized = normalizeOrgRole(role ?? undefined)
  const n = normalized ?? (typeof role === 'string' && role.length > 0 ? role.toLowerCase() : '')
  switch (n) {
    case 'super_admin':
    case 'owner':
      return 'Owner'
    case 'admin':
      return 'Admin'
    case 'manager':
      return 'Manager'
    case 'employee':
      return 'Employee'
    case 'viewer':
      return 'Viewer'
    default:
      if (!n) return '—'
      return typeof role === 'string' && role.length > 0 ? role : n
  }
}

/** Mirrors backend `Permission` string values (from GET /v1/app/auth/me → authz.permissions). */
export const PermissionKey = {
  USERS_ASSIGN_MANAGER: 'users.assign_manager',
  USERS_SUSPEND: 'users.suspend',
  USERS_ROLE_SET_MANAGER: 'users.role_set_manager',
  USERS_ROLE_SET_ADMIN: 'users.role_set_admin',
  OFFLINE_TIME_MANAGE_USER: 'offline_time.manage_user',
} as const

export function isManagerOrAbove(role: string | undefined): boolean {
  return role === 'manager' || role === 'admin' || role === 'super_admin'
}

export function isOrgAdminRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

export function isOrgSuperAdmin(role: string | undefined): boolean {
  return role === 'super_admin'
}

export function isOrgAdminOnly(role: string | undefined): boolean {
  return role === 'admin'
}

/**
 * Invite modal role values (maps to Prisma `UserRole` on the API).
 * Mirrors backend `getAllowedInviteRoles` in `packages/backend/src/lib/permissions.ts`.
 */
export type InviteRoleOption = 'employee' | 'manager' | 'admin' | 'viewer'

/** Prisma role strings an inviter may assign (same set as backend `getAllowedInviteRoles`). */
export function getAllowedInviteApiRolesForOrgRole(
  normalizedUiRole: string | undefined
): Set<'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER'> {
  const r = normalizedUiRole ?? ''
  if (r === 'super_admin') return new Set(['ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER'])
  if (r === 'admin') return new Set(['MANAGER', 'EMPLOYEE', 'VIEWER'])
  if (r === 'manager') return new Set(['EMPLOYEE', 'VIEWER'])
  return new Set()
}

/** Ordered options for the invite-role dropdown for the signed-in org role. */
export function getInviteRoleOptionsForOrgRole(
  normalizedUiRole: string | undefined
): InviteRoleOption[] {
  const api = getAllowedInviteApiRolesForOrgRole(normalizedUiRole)
  const out: InviteRoleOption[] = []
  if (api.has('ADMIN')) out.push('admin')
  if (api.has('MANAGER')) out.push('manager')
  if (api.has('EMPLOYEE')) out.push('employee')
  if (api.has('VIEWER')) out.push('viewer')
  return out
}

export function defaultInviteRoleForOrgRole(
  normalizedUiRole: string | undefined
): InviteRoleOption {
  const opts = getInviteRoleOptionsForOrgRole(normalizedUiRole)
  return opts[0] ?? 'employee'
}

/** Whether this inviter may resend/revoke an invite that assigns `inviteRole` (API enum string, e.g. EMPLOYEE). */
export function canManageExistingInviteForRole(
  normalizedInviterUiRole: string | undefined,
  inviteRoleFromApi: string | undefined
): boolean {
  if (!inviteRoleFromApi) return false
  const key = inviteRoleFromApi.toUpperCase() as 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER'
  return getAllowedInviteApiRolesForOrgRole(normalizedInviterUiRole).has(key)
}

/**
 * Who may open the Configuration hub / sidebar: org managers and admins (their org), or
 * platform admins (when they have a matching org role for a platform link).
 */
export function canAccessConfigurationNav(
  role: string | undefined,
  isPlatformAdmin: boolean | undefined
): boolean {
  if (isManagerOrAbove(role)) return true
  if (!isPlatformAdmin) return false
  return isOrgSuperAdmin(role) || isOrgAdminOnly(role)
}

/** Workspace policies (org settings) under Configuration — org admins only */
export function hasWorkspaceConfigurationLinks(role: string | undefined): boolean {
  return isOrgAdminRole(role)
}

/** Org users list / people management — org managers and admins */
export function hasTeamConfigurationLink(role: string | undefined): boolean {
  return isManagerOrAbove(role)
}

/** Platform links under Configuration */
export function hasPlatformConfigurationLinks(
  role: string | undefined,
  isPlatformAdmin: boolean | undefined
): boolean {
  return Boolean(isOrgSuperAdmin(role)) || Boolean(isPlatformAdmin && isOrgAdminOnly(role))
}

export function hasVisibleConfigurationSidebarLinks(
  role: string | undefined,
  isPlatformAdmin: boolean | undefined
): boolean {
  /** Org managers use the main app nav only; team/org users/settings links are not offered. */
  if (role === 'manager') {
    return hasPlatformConfigurationLinks(role, isPlatformAdmin)
  }
  /** Platform super admins are not scoped to a tenant — no org workspace links. */
  const orgWorkspace =
    isPlatformAdmin !== true &&
    (hasWorkspaceConfigurationLinks(role) || hasTeamConfigurationLink(role))
  return orgWorkspace || hasPlatformConfigurationLinks(role, isPlatformAdmin)
}

/** Sidebar + account menu: show Configuration block */
export function canShowConfigurationSidebar(
  role: string | undefined,
  isPlatformAdmin: boolean | undefined
): boolean {
  return (
    canAccessConfigurationNav(role, isPlatformAdmin) &&
    hasVisibleConfigurationSidebarLinks(role, isPlatformAdmin)
  )
}

/** Default route when opening Configuration (navbar / legacy /myhome/settings). */
export function getConfigurationEntryHref(
  role: string | undefined,
  isPlatformAdmin: boolean | undefined
): string {
  if (isPlatformAdmin === true) return '/admin/dashboard'
  if (isOrgAdminRole(role)) return '/myhome/organization/settings'
  if (role === 'manager') return '/myhome'
  return '/myhome'
}

export type DashboardSettingsShortcut =
  | { kind: 'workspace'; href: string; label: string }
  | { kind: 'users'; href: string; label: string }

/** Dashboard header: org admins → workspace. Hidden for employees, org managers, and platform admins. */
export function getDashboardSettingsShortcut(
  role: string | undefined,
  isPlatformAdmin: boolean | undefined
): DashboardSettingsShortcut | null {
  if (isPlatformAdmin === true) return null
  if (isOrgAdminRole(role)) {
    return {
      kind: 'workspace',
      href: '/myhome/organization/settings',
      label: 'Organization',
    }
  }
  return null
}
