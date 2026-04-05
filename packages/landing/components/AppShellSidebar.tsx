'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Bell,
  Building2,
  Camera,
  Clock,
  FileText,
  LayoutDashboard,
  Settings,
  Shield,
  UserCog,
  Users,
} from 'lucide-react'
import {
  canShowConfigurationSidebar,
  hasTeamConfigurationLink,
  isManagerOrAbove,
  isOrgAdminOnly,
  isOrgAdminRole,
  isOrgSuperAdmin,
} from '@/lib/roles'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSSE } from '@/hooks/useSSE'
import type { AppNotification } from '@/stores/notificationStore'
import { NotificationCenter } from '@/components/NotificationCenter'

// ── Offline pending badge ───────────────────────────────────────────────────────

function OfflinePendingBadge() {
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
  return (
    <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-[18px] text-white min-w-[18px] text-center">
      {count}
    </span>
  )
}

// ── Notification bell ───────────────────────────────────────────────────────────

function NotificationBell() {
  const { unreadCount, hydrate, addNotification } = useNotificationStore()
  const [centerOpen, setCenterOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const prevCount = useRef(unreadCount)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useSSE((evt) => {
    if (evt.type && evt.payload) {
      addNotification(evt.payload as AppNotification)
    }
  })

  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 1000)
      return () => clearTimeout(t)
    }
    prevCount.current = unreadCount
  }, [unreadCount])

  return (
    <>
      <button
        type="button"
        onClick={() => setCenterOpen(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white transition-transform',
              pulse && 'animate-[pulse_0.5s_ease-in-out_2]'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <NotificationCenter open={centerOpen} onClose={() => setCenterOpen(false)} />
    </>
  )
}

// ── Sidebar ─────────────────────────────────────────────────────────────────────

export function AppShellSidebar() {
  const pathname = usePathname() ?? ''
  const { data: session, status } = useSession()

  if (status === 'unauthenticated') return null

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

  const isAdmin = isOrgAdminRole(role)
  const isManager = isManagerOrAbove(role)
  const showConfiguration = canShowConfigurationSidebar(role, isPlatformAdmin)
  const showOrgUsersLink = hasTeamConfigurationLink(role)
  const showPlatformOrgs = isOrgSuperAdmin(role)
  const showPlatformUsers = isOrgSuperAdmin(role) || (isPlatformAdmin && isOrgAdminOnly(role))

  const orgUsersNavLabel = showOrgUsersLink && showPlatformUsers ? 'This organization' : 'Users'

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const linkCls = (active: boolean) =>
    cn(
      'flex items-center gap-2 rounded-r-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'border-l-2 border-brand-primary bg-brand-primary/10 text-brand-primary'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
    )

  return (
    <aside
      className={cn(
        'w-full shrink-0 border-b border-border bg-muted/15 md:w-60 md:border-b-0 md:border-r',
        'md:sticky md:top-[3.75rem] md:z-40 md:h-[calc(100vh-3.75rem)]'
      )}
    >
      <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-3" aria-label="Application">
        {/* Main section */}
        <Link href="/myhome/dashboard" className={linkCls(isActive('/myhome/dashboard'))}>
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
          Dashboard
        </Link>

        <Link href="/myhome" className={linkCls(pathname === '/myhome' || pathname === '/myhome/')}>
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          My Time
        </Link>

        <Link href="/myhome/offline-time" className={linkCls(isActive('/myhome/offline-time'))}>
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          Offline Time
          {isManager && <OfflinePendingBadge />}
        </Link>

        <Link href="/myhome/reports" className={linkCls(isActive('/myhome/reports'))}>
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          Reports
        </Link>

        <hr className="my-2 border-border/50" />

        {/* Team — MANAGER+ only */}
        {isManager && (
          <>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Team
            </p>
            <Link href="/myhome/team" className={linkCls(isActive('/myhome/team'))}>
              <Users className="h-4 w-4 shrink-0" aria-hidden />
              Team
            </Link>
            <hr className="my-2 border-border/50" />
          </>
        )}

        {/* Organization — ADMIN+ only */}
        {showConfiguration && (
          <>
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Organization
            </p>
            <div className="flex flex-col gap-0.5">
              {showOrgUsersLink && (
                <Link
                  href="/myhome/organization/users"
                  className={linkCls(isActive('/myhome/organization/users'))}
                >
                  <UserCog className="h-4 w-4 shrink-0" aria-hidden />
                  {orgUsersNavLabel}
                </Link>
              )}

              {isAdmin && (
                <>
                  <Link
                    href="/myhome/organization/team"
                    className={linkCls(isActive('/myhome/organization/team'))}
                  >
                    <Users className="h-4 w-4 shrink-0" aria-hidden />
                    Teams
                  </Link>
                  <Link
                    href="/myhome/organization/settings"
                    className={linkCls(isActive('/myhome/organization/settings'))}
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden />
                    Settings
                  </Link>
                  <Link
                    href="/myhome/organization/audit"
                    className={linkCls(isActive('/myhome/organization/audit'))}
                  >
                    <Shield className="h-4 w-4 shrink-0" aria-hidden />
                    Audit Log
                  </Link>
                </>
              )}

              {(showPlatformOrgs || showPlatformUsers || isPlatformAdmin) && (
                <>
                  <div className="my-2 hidden h-px bg-border/50 md:block" role="separator" />
                  <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    Platform
                  </p>
                  {isPlatformAdmin && (
                    <Link href="/admin/dashboard" className={linkCls(isActive('/admin/dashboard'))}>
                      <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
                      Platform Dashboard
                    </Link>
                  )}
                  {(showPlatformOrgs || isPlatformAdmin) && (
                    <Link href="/admin/orgs" className={linkCls(isActive('/admin/orgs'))}>
                      <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                      Organizations
                    </Link>
                  )}
                  {(showPlatformUsers || isPlatformAdmin) && (
                    <Link href="/admin/users" className={linkCls(isActive('/admin/users'))}>
                      <Users className="h-4 w-4 shrink-0" aria-hidden />
                      All users
                    </Link>
                  )}
                  {isPlatformAdmin && (
                    <Link href="/admin/billing" className={linkCls(isActive('/admin/billing'))}>
                      <FileText className="h-4 w-4 shrink-0" aria-hidden />
                      Billing
                    </Link>
                  )}
                </>
              )}
            </div>

            <hr className="my-2 border-border/50" />
          </>
        )}

        {/* Settings */}
        <Link href="/myhome/settings" className={linkCls(isActive('/myhome/settings'))}>
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          Settings
        </Link>

        {/* Spacer + notification bell at bottom */}
        <div className="mt-auto flex items-center justify-between px-1 pt-4">
          <NotificationBell />
        </div>
      </nav>
    </aside>
  )
}
