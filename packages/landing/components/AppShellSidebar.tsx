'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import {
  canShowConfigurationSidebar,
  hasTeamConfigurationLink,
  isManagerOrAbove,
  isOrgAdminOnly,
  isOrgAdminRole,
  isOrgSuperAdmin,
  normalizeOrgRole,
} from '@/lib/roles'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useSidebar } from '@/components/sidebar-context'

// ── Offline pending badge ───────────────────────────────────────────────────────

function OfflinePendingBadge({ collapsed }: { collapsed?: boolean }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true
    const load = () =>
      api
        .get('/v1/app/offline-time/pending')
        .then((r) => {
          if (mounted) setCount(r.data.count ?? 0)
        })
        .catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  if (count === 0) return null
  if (collapsed) {
    return (
      <span
        className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-background"
        aria-label={`${count} pending offline requests`}
      >
        {count > 9 ? '9+' : count}
      </span>
    )
  }
  return (
    <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-[18px] text-white min-w-[18px] text-center">
      {count}
    </span>
  )
}

function NavRow({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  badge,
}: {
  href: string
  icon: LucideIcon
  label: string
  active: boolean
  collapsed: boolean
  badge?: ReactNode
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'relative flex items-center gap-2 rounded-r-lg px-3 py-2 text-sm font-medium transition-colors',
        collapsed && 'justify-center rounded-lg px-2',
        active
          ? collapsed
            ? 'bg-brand-primary/10 text-brand-primary'
            : 'border-l-2 border-brand-primary bg-brand-primary/10 text-brand-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge}
      {collapsed && badge}
    </Link>
  )
}

// ── Sidebar ─────────────────────────────────────────────────────────────────────

export function AppShellSidebar() {
  const pathname = usePathname() ?? ''
  const { data: session, status } = useSession()
  const { collapsed, setCollapsed } = useSidebar()
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem('tracksync-sidebar-pinned') === '1')
    } catch {
      setPinned(false)
    }
  }, [])

  function persistPinned(v: boolean) {
    try {
      window.localStorage.setItem('tracksync-sidebar-pinned', v ? '1' : '0')
    } catch {
      // noop
    }
  }

  function togglePin() {
    const next = !pinned
    setPinned(next)
    persistPinned(next)
    if (next) {
      setHoverExpanded(false)
      setCollapsed(false)
    } else {
      setCollapsed(true)
    }
  }

  if (status === 'unauthenticated') return null

  if (status === 'loading') {
    return (
      <aside
        className={cn(
          'w-full shrink-0 border-b border-border bg-muted/15 md:border-b-0 md:border-r',
          'md:sticky md:top-[3.75rem] md:z-40 md:h-[calc(100vh-3.75rem)]',
          collapsed ? 'md:w-[4.25rem]' : 'md:w-60'
        )}
      >
        <div className="p-3">
          <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </aside>
    )
  }

  const rawRole = session?.user?.role as string | undefined
  const role = normalizeOrgRole(rawRole)
  const isPlatformAdmin = session?.user?.is_platform_admin === true

  const isAdmin = isOrgAdminRole(role)
  const isManager = isManagerOrAbove(role)
  const isSuperAdmin = isOrgSuperAdmin(role)
  /** Org role `manager` only — not admin/super_admin. */
  const isOrgManagerOnly = role === 'manager'
  const showConfiguration = canShowConfigurationSidebar(role, isPlatformAdmin)
  const showOrgUsersLink = hasTeamConfigurationLink(role)
  const showPlatformOrgs = isOrgSuperAdmin(role)
  const showPlatformUsers = isOrgSuperAdmin(role) || (isPlatformAdmin && isOrgAdminOnly(role))

  const hasPlatformSidebarLinks = showPlatformOrgs || showPlatformUsers || isPlatformAdmin
  /** Team module is intentionally hidden for admin/super admin in dashboard sidebar. */
  const showOrgUsersNav = showOrgUsersLink && !isOrgManagerOnly
  const showTeamNav = false
  const showPersonalSettingsLink = !isOrgManagerOnly && !isOrgAdminRole(role)
  const showOrganizationSection =
    showConfiguration &&
    !isSuperAdmin &&
    (isAdmin || showOrgUsersNav || (isOrgManagerOnly && hasPlatformSidebarLinks))
  const showPlatformSection =
    showConfiguration && (showPlatformOrgs || showPlatformUsers || isPlatformAdmin)

  const effectiveCollapsed = !pinned && collapsed && !hoverExpanded

  const peopleNavActive =
    pathname.startsWith('/myhome/organization/people') ||
    pathname === '/myhome/organization/users' ||
    pathname === '/myhome/organization/team'

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const homeActive = pathname === '/myhome' || pathname === '/myhome/'

  return (
    <aside
      onMouseEnter={() => {
        if (!pinned && collapsed) setHoverExpanded(true)
      }}
      onMouseLeave={() => {
        if (!pinned) setHoverExpanded(false)
      }}
      className={cn(
        'w-full shrink-0 border-b border-border bg-muted/15 md:border-b-0 md:border-r',
        'md:sticky md:top-[3.75rem] md:z-40 md:h-[calc(100vh-3.75rem)]',
        'md:transition-[width] md:duration-300 md:ease-out motion-reduce:transition-none',
        effectiveCollapsed ? 'md:w-[4.25rem]' : 'md:w-60'
      )}
    >
      <nav
        className="flex h-full flex-col gap-0.5 overflow-y-auto p-3 transition-[padding] duration-300 ease-out motion-reduce:transition-none"
        aria-label="Application"
      >
        <div
          className={cn(
            'mb-1 flex shrink-0 items-center pb-1',
            effectiveCollapsed ? 'justify-center' : 'justify-end'
          )}
        >
          <button
            type="button"
            onClick={togglePin}
            className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            aria-expanded={pinned || !effectiveCollapsed}
            aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            {pinned ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <>
                {effectiveCollapsed ? (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden />
                )}
              </>
            )}
          </button>
        </div>

        {!isSuperAdmin && (
          <>
            <NavRow
              href="/myhome"
              icon={Home}
              label="Home"
              active={homeActive}
              collapsed={effectiveCollapsed}
            />

            <NavRow
              href="/myhome/dashboard"
              icon={LayoutDashboard}
              label="Dashboard"
              active={isActive('/myhome/dashboard')}
              collapsed={effectiveCollapsed}
            />

            <NavRow
              href="/myhome/offline-time"
              icon={Clock}
              label="Offline Time"
              active={isActive('/myhome/offline-time')}
              collapsed={effectiveCollapsed}
              badge={isManager ? <OfflinePendingBadge collapsed={effectiveCollapsed} /> : undefined}
            />

            <NavRow
              href="/myhome/reports"
              icon={FileText}
              label="Reports"
              active={isActive('/myhome/reports')}
              collapsed={effectiveCollapsed}
            />

            <hr className="my-2 border-border/50" />
          </>
        )}

        {showTeamNav && (
          <>
            {!effectiveCollapsed && (
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Team
              </p>
            )}
            <NavRow
              href="/myhome/team"
              icon={Users}
              label="Team"
              active={isActive('/myhome/team')}
              collapsed={effectiveCollapsed}
            />
            <hr className="my-2 border-border/50" />
          </>
        )}

        {showOrganizationSection && (
          <>
            {!effectiveCollapsed && (
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Organization
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {showOrgUsersNav && (
                <NavRow
                  href="/myhome/organization/people"
                  icon={Users}
                  label="People"
                  active={peopleNavActive}
                  collapsed={effectiveCollapsed}
                />
              )}

              {isAdmin && (
                <>
                  <NavRow
                    href="/myhome/organization/settings"
                    icon={Settings}
                    label="Settings"
                    active={isActive('/myhome/organization/settings')}
                    collapsed={effectiveCollapsed}
                  />
                </>
              )}
            </div>

            <hr className="my-2 border-border/50" />
          </>
        )}

        {showPlatformSection && (
          <>
            {!effectiveCollapsed && (
              <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Platform
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {isPlatformAdmin && (
                <NavRow
                  href="/admin/dashboard"
                  icon={LayoutDashboard}
                  label="Platform Dashboard"
                  active={isActive('/admin/dashboard')}
                  collapsed={effectiveCollapsed}
                />
              )}
              {(showPlatformOrgs || isPlatformAdmin) && (
                <NavRow
                  href="/admin/orgs"
                  icon={Building2}
                  label="Organizations"
                  active={isActive('/admin/orgs')}
                  collapsed={effectiveCollapsed}
                />
              )}
              {(showPlatformUsers || isPlatformAdmin) && (
                <NavRow
                  href="/admin/users"
                  icon={Users}
                  label="All users"
                  active={isActive('/admin/users')}
                  collapsed={effectiveCollapsed}
                />
              )}
              {isPlatformAdmin && (
                <NavRow
                  href="/admin/billing"
                  icon={CreditCard}
                  label="Billing"
                  active={isActive('/admin/billing')}
                  collapsed={effectiveCollapsed}
                />
              )}
              {isPlatformAdmin && (
                <NavRow
                  href="/admin/audit"
                  icon={ScrollText}
                  label="Audit Log"
                  active={isActive('/admin/audit')}
                  collapsed={effectiveCollapsed}
                />
              )}
            </div>
            <hr className="my-2 border-border/50" />
          </>
        )}

        {showPersonalSettingsLink && (
          <NavRow
            href="/myhome/settings"
            icon={Settings}
            label="Settings"
            active={isActive('/myhome/settings')}
            collapsed={effectiveCollapsed}
          />
        )}
      </nav>
    </aside>
  )
}
