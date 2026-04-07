'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LayoutDashboard, LogOut, Menu, Play, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { clearScreenshotImageCache } from '@/lib/screenshotThumbCache'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { canShowConfigurationSidebar, getConfigurationEntryHref } from '@/lib/roles'
import { NotificationBell } from '@/components/NotificationBell'

const centerLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export function Navbar() {
  const pathname = usePathname()
  const path = pathname ?? ''
  const { data: session, status } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const authed = status === 'authenticated'

  const name = session?.user?.name ?? 'User'
  const firstName = name.split(' ')[0] ?? name
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const onLogin = path === '/login'
  const hideMarketingNavLinks = path.startsWith('/myhome') || path.startsWith('/admin')
  const role = session?.user?.role as string | undefined
  const isPlatformAdmin = session?.user?.is_platform_admin
  const showConfigurationHub = canShowConfigurationSidebar(role, isPlatformAdmin)
  const configurationHref = getConfigurationEntryHref(role, isPlatformAdmin)

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const closeMobile = () => setMobileOpen(false)

  const handleSignOut = async () => {
    closeMobile()
    await clearScreenshotImageCache().catch(() => {})
    const home = typeof window !== 'undefined' ? `${window.location.origin}/` : '/'
    await signOut({ callbackUrl: home, redirect: true })
  }

  const linkCls = (active: boolean) =>
    cn(
      'text-sm font-medium transition-colors duration-200',
      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
    )

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 border-b',
        authed
          ? 'border-border bg-background shadow-sm'
          : 'border-border/80 bg-background/85 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/75'
      )}
    >
      {!authed && (
        <div
          className="pointer-events-none absolute inset-0 gradient-mesh opacity-[0.35]"
          aria-hidden
        />
      )}
      <div
        className={cn(
          'relative flex h-14 items-center gap-4 px-4 sm:h-16 sm:px-6',
          authed ? 'w-full' : 'mx-auto max-w-6xl'
        )}
      >
        <Link
          href="/"
          onClick={closeMobile}
          className="flex shrink-0 items-center gap-2.5 text-base font-semibold tracking-tight text-foreground sm:text-lg"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/10">
            <Play className="relative z-10 h-4 w-4 fill-primary text-primary" strokeWidth={0} />
            <span className="absolute left-1 top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          </span>
          TrackSync
        </Link>

        {!hideMarketingNavLinks ? (
          <nav
            className="hidden flex-1 items-center justify-center gap-8 sm:flex"
            aria-label="Main"
          >
            {centerLinks.map(({ href, label }) => (
              <Link key={href} href={href} className={linkCls(path === href)}>
                {label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {!authed && (
            <>
              <ThemeToggle className="hidden sm:block" />
              <Button
                asChild
                size="sm"
                className={cn(
                  'hidden rounded-xl px-4 shadow-md shadow-primary/15 transition-all hover:shadow-primary/25 sm:inline-flex',
                  onLogin && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                )}
              >
                <Link href="/login" aria-current={onLogin ? 'page' : undefined}>
                  Login
                </Link>
              </Button>
            </>
          )}

          {authed && (
            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationBell />
              <div className="hidden items-center gap-2 sm:flex">
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2.5 rounded-xl py-1.5 pl-3 pr-1.5 text-foreground outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label={`Account menu for ${name}`}
                    >
                      <span className="text-sm font-medium">Hello, {firstName}</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-muted/30 text-xs font-semibold text-foreground">
                        {initials}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem] p-0">
                    <div className="border-b border-border px-3 py-3">
                      <p className="text-sm font-semibold text-card-foreground">{name}</p>
                      {session?.user?.email ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {session.user.email}
                        </p>
                      ) : null}
                    </div>
                    <div className="p-1">
                      <DropdownMenuItem asChild>
                        <Link href="/myhome" className="flex cursor-pointer items-center gap-2.5">
                          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                          Home
                        </Link>
                      </DropdownMenuItem>
                      {showConfigurationHub ? (
                        <DropdownMenuItem asChild>
                          <Link
                            href={configurationHref}
                            className="flex cursor-pointer items-center gap-2.5"
                          >
                            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                            Configuration
                          </Link>
                        </DropdownMenuItem>
                      ) : null}
                    </div>
                    <DropdownMenuSeparator className="my-0" />
                    <div className="p-1">
                      <DropdownMenuItem
                        className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onSelect={() => {
                          void handleSignOut()
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl sm:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl sm:hidden">
          <nav
            className="flex max-h-[min(80vh,520px)] flex-col overflow-y-auto px-4 pb-6 pt-4"
            aria-label="Mobile"
          >
            {authed ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-sm font-semibold text-foreground">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    Hello, {firstName}
                  </p>
                  {session?.user?.email ? (
                    <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              {authed ? (
                <>
                  <Link
                    href="/myhome"
                    onClick={closeMobile}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                    Home
                  </Link>
                  {showConfigurationHub ? (
                    <Link
                      href={configurationHref}
                      onClick={closeMobile}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                      Configuration
                    </Link>
                  ) : null}
                </>
              ) : null}

              {!hideMarketingNavLinks
                ? centerLinks.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeMobile}
                      className={cn(
                        'rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted',
                        path === href
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </Link>
                  ))
                : null}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              {authed ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-xl px-3 py-2">
                    <span className="text-sm text-muted-foreground">Theme</span>
                    <ThemeToggle />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-xl px-3 py-2">
                    <span className="text-sm text-muted-foreground">Theme</span>
                    <ThemeToggle />
                  </div>
                  <Button asChild className="w-full rounded-xl shadow-md shadow-primary/15">
                    <Link href="/login" onClick={closeMobile}>
                      Login
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
