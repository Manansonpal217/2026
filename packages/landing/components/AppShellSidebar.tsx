'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Building2, LayoutDashboard, Settings2, UserCog, Users } from 'lucide-react'
import {
  canShowConfigurationSidebar,
  isOrgAdminOnly,
  isOrgAdminRole,
  isOrgSuperAdmin,
  hasTeamConfigurationLink,
} from '@/lib/roles'
import { cn } from '@/lib/utils'

const workspacePoliciesLink = {
  href: '/myhome/organization/settings',
  label: 'Workspace',
  icon: Settings2,
} as const

const orgUsersLink = {
  href: '/myhome/organization/users',
  icon: UserCog,
} as const

const platformOrgsLink = {
  href: '/admin/orgs',
  label: 'Organizations',
  icon: Building2,
} as const

const platformUsersLink = {
  href: '/admin/users',
  icon: Users,
} as const

function homeActive(path: string): boolean {
  return path === '/myhome' || path === '/myhome/'
}

export function AppShellSidebar() {
  const pathname = usePathname() ?? ''
  const { data: session, status } = useSession()

  if (status === 'unauthenticated') {
    return null
  }

  if (status === 'loading') {
    return (
      <aside
        className={cn(
          'w-full shrink-0 border-b border-border bg-muted/15 md:w-60 md:border-b-0 md:border-r',
          'md:sticky md:top-[3.75rem] md:z-40 md:h-[calc(100vh-3.75rem)]'
        )}
      >
        <div className="p-3">
          <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </aside>
    )
  }

  const role = session?.user?.role as string | undefined
  const isPlatformAdmin = session?.user?.is_platform_admin === true

  const showWorkspacePolicies = isOrgAdminRole(role)
  const showOrgUsersLink = hasTeamConfigurationLink(role)

  /** All-tenants org directory: any org super_admin, not only platform admins. */
  const showPlatformOrgs = isOrgSuperAdmin(role)
  /** Cross-tenant user directory: org super_admin (read) or platform admin with org admin role. */
  const showPlatformUsers = isOrgSuperAdmin(role) || (isPlatformAdmin && isOrgAdminOnly(role))

  const orgUsersActive =
    pathname === orgUsersLink.href || pathname.startsWith(`${orgUsersLink.href}/`)

  const hasWorkspaceLinks = showWorkspacePolicies || showOrgUsersLink
  const hasPlatformLinks = showPlatformOrgs || showPlatformUsers

  /** Two user lists exist; label the org-scoped one so it is not confused with the tenant-wide directory. */
  const orgUsersNavLabel = showOrgUsersLink && showPlatformUsers ? 'This organization' : 'Users'
  const platformUsersNavLabel = 'All users'

  const showConfigurationSection = canShowConfigurationSidebar(role, isPlatformAdmin)

  const linkCls = (active: boolean) =>
    cn(
      'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
    )

  return (
    <aside
      className={cn(
        'w-full shrink-0 border-b border-border bg-muted/15 md:w-60 md:border-b-0 md:border-r',
        'md:sticky md:top-[3.75rem] md:z-40 md:h-[calc(100vh-3.75rem)]'
      )}
    >
      <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Application">
        <Link href="/myhome" className={linkCls(homeActive(pathname))}>
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
          Home
        </Link>

        {showConfigurationSection ? (
          <>
            <p className="mt-3 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Configuration
            </p>
            <div className="flex flex-col gap-0.5 border-l-2 border-border/80 pl-2 md:ml-2 md:pl-3">
              {showWorkspacePolicies ? (
                <Link
                  href={workspacePoliciesLink.href}
                  className={linkCls(pathname === workspacePoliciesLink.href)}
                >
                  <Settings2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  {workspacePoliciesLink.label}
                </Link>
              ) : null}

              {showOrgUsersLink ? (
                <Link href={orgUsersLink.href} className={linkCls(orgUsersActive)}>
                  <UserCog className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  {orgUsersNavLabel}
                </Link>
              ) : null}

              {hasWorkspaceLinks && hasPlatformLinks ? (
                <div className="my-2 hidden h-px bg-border md:block" role="separator" />
              ) : null}

              {showPlatformOrgs ? (
                <Link
                  href={platformOrgsLink.href}
                  className={linkCls(
                    pathname === platformOrgsLink.href ||
                      pathname.startsWith(platformOrgsLink.href + '/')
                  )}
                >
                  <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                  {platformOrgsLink.label}
                </Link>
              ) : null}

              {showPlatformUsers ? (
                <Link
                  href={platformUsersLink.href}
                  className={linkCls(
                    pathname === platformUsersLink.href ||
                      pathname.startsWith(platformUsersLink.href + '/')
                  )}
                >
                  <Users className="h-4 w-4 shrink-0" aria-hidden />
                  {platformUsersNavLabel}
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </nav>
    </aside>
  )
}
