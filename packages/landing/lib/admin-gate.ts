/**
 * Central rules for `/admin/*` so nested layouts never send users in circles
 * (e.g. users → orgs → users when two layouts disagree).
 *
 * Session/JWT `role` is normalized by NextAuth (OWNER → `super_admin`).
 */

export type AdminGateUserLike = {
  is_platform_admin?: boolean | null
  role?: string | null
}

/** Platform ops console: platform admin or org owner (tenant super admin). */
export function mayAccessAdminConsole(user: AdminGateUserLike | null | undefined): boolean {
  return user?.is_platform_admin === true || user?.role === 'super_admin'
}

/** Cross-tenant user admin (`/admin/users`) — platform staff only. */
export function mayAccessPlatformUserAdmin(user: AdminGateUserLike | null | undefined): boolean {
  return user?.is_platform_admin === true
}

/** Create org from admin (`/admin/orgs/new`) — platform staff only. */
export function mayCreateOrganizationInAdmin(user: AdminGateUserLike | null | undefined): boolean {
  return user?.is_platform_admin === true
}

/** Safe redirect when org owners cannot use a platform-only screen (never point at another gated sibling that bounces back). */
export const ADMIN_ORG_DIRECTORY_HREF = '/admin/orgs'

export const ADMIN_DENIED_FALLBACK_HREF = '/myhome'
