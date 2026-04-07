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
  return (
    hasWorkspaceConfigurationLinks(role) ||
    hasTeamConfigurationLink(role) ||
    hasPlatformConfigurationLinks(role, isPlatformAdmin)
  )
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
  if (isOrgAdminRole(role)) return '/myhome/organization/settings'
  if (role === 'manager') return '/myhome'
  if (isOrgSuperAdmin(role)) return '/admin/orgs'
  if (isPlatformAdmin && isOrgAdminOnly(role)) return '/admin/users'
  return '/myhome'
}

export type DashboardSettingsShortcut =
  | { kind: 'workspace'; href: string; label: string }
  | { kind: 'users'; href: string; label: string }

/** Dashboard header: org admins → workspace. Hidden for employees and org managers. */
export function getDashboardSettingsShortcut(
  role: string | undefined
): DashboardSettingsShortcut | null {
  if (isOrgAdminRole(role)) {
    return {
      kind: 'workspace',
      href: '/myhome/organization/settings',
      label: 'Organization',
    }
  }
  return null
}
