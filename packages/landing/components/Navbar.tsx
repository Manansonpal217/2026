'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LayoutDashboard, LogOut, Menu, Play, Shield, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { clearScreenshotImageCache } from '@/lib/screenshotThumbCache'
import { cn } from '@/lib/utils'

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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
  const hideMarketingNavLinks = path.startsWith('/myhome')

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const closeMobile = () => setMobileOpen(false)

  const handleSignOut = async () => {
    closeMobile()
    setDropdownOpen(false)
    await clearScreenshotImageCache().catch(() => {})
    // Use the live origin so sign-out works when NEXTAUTH_URL and dev port differ (e.g. 3002 vs 3000).
    const home = typeof window !== 'undefined' ? `${window.location.origin}/` : '/'
    await signOut({ callbackUrl: home, redirect: true })
  }

  const linkCls = (active: boolean) =>
    cn(
      'text-sm font-medium transition-colors',
      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
    )

  const loginCtaClass = cn(
    'rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40',
    onLogin && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
  )

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/80 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          onClick={closeMobile}
          className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight text-foreground sm:text-lg"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Play className="relative z-10 h-4 w-4 fill-primary text-primary" strokeWidth={0} />
            <span className="absolute left-1 top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          </span>
          TrackSync
        </Link>

        {!hideMarketingNavLinks ? (
          <nav
            className="hidden flex-1 items-center justify-center gap-7 sm:flex"
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
              <Link
                href="/login"
                onClick={closeMobile}
                aria-current={onLogin ? 'page' : undefined}
                className={cn('hidden sm:block', loginCtaClass)}
              >
                Login / Sign up
              </Link>
            </>
          )}

          {authed && (
            <div ref={dropdownRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-1.5 text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                aria-label={`Account menu for ${name}`}
              >
                <span className="text-sm font-medium">Hello, {firstName}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border text-xs font-bold text-foreground">
                  {initials}
                </span>
              </button>

              {dropdownOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] z-[100] min-w-[12rem] overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/10"
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-card-foreground">{name}</p>
                    {session?.user?.email ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {session.user.email}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href="/myhome"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-card-foreground transition-colors hover:bg-muted"
                  >
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                    Dashboard
                  </Link>
                  {session?.user?.is_platform_admin ? (
                    <Link
                      href="/admin/orgs"
                      role="menuitem"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-card-foreground transition-colors hover:bg-muted"
                    >
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      Platform admin
                    </Link>
                  ) : null}
                  <div className="border-t border-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="rounded-lg p-2 text-foreground hover:bg-muted sm:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl sm:hidden">
          <nav
            className="flex max-h-[min(80vh,520px)] flex-col overflow-y-auto px-4 pb-6 pt-4"
            aria-label="Mobile"
          >
            {authed ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-sm font-bold text-foreground">
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
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                    Dashboard
                  </Link>
                  {session?.user?.is_platform_admin ? (
                    <Link
                      href="/admin/orgs"
                      onClick={closeMobile}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      Platform admin
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
                        'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted',
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
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-lg px-3 py-2">
                    <span className="text-sm text-muted-foreground">Theme</span>
                    <ThemeToggle />
                  </div>
                  <Link
                    href="/login"
                    onClick={closeMobile}
                    className={cn('block text-center', loginCtaClass)}
                  >
                    Login / Sign up
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
