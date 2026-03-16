'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Clock,
  Camera,
  BarChart3,
  Settings,
  LogOut,
  Zap,
  ChevronRight,
  Plug,
  CheckSquare,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, getAvatarGradient } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  active: boolean
  badge?: string
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, active: true },
  { label: 'Team', href: '/admin/team', icon: Users, active: true },
  { label: 'Time Tracking', href: '/admin/time', icon: Clock, active: true },
  { label: 'Screenshots', href: '/admin/screenshots', icon: Camera, active: true },
  { label: 'Reports', href: '/admin/reports', icon: BarChart3, active: true },
  { label: 'Approvals', href: '/admin/approvals', icon: CheckSquare, active: true },
  { label: 'Integrations', href: '/admin/integrations', icon: Plug, active: true },
  { label: 'Settings', href: '/admin/settings', icon: Settings, active: true },
  { label: 'Audit Log', href: '/admin/audit', icon: Shield, active: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  const role = (session?.user as { role?: string })?.role ?? 'employee'

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col z-30 border-r border-border/50">
      {/* Background */}
      <div className="absolute inset-0 bg-surface/95 backdrop-blur-xl" />

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow-sm">
            <Zap className="h-4 w-4 text-white" fill="white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground tracking-tight">TrackSync</span>
            <span className="text-[10px] text-muted-foreground leading-none">Work Intelligence</span>
          </div>
        </div>

        <Separator className="mx-3 w-auto" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="mb-2 px-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Navigation
            </span>
          </div>

          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon

            return (
              <div key={item.href}>
                {item.active ? (
                  <Link
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                      'transition-all duration-150',
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <ChevronRight className="h-3 w-3 text-primary/60 shrink-0" />
                    )}
                  </Link>
                ) : (
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                      'text-muted-foreground/40 cursor-not-allowed',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground/60 border border-border/30">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <Separator className="mx-3 w-auto" />

        {/* User card */}
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/5 transition-colors duration-150 group">
            <Avatar className="h-8 w-8">
              <AvatarFallback className={cn('text-xs bg-gradient-to-br', getAvatarGradient(role))}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {session?.user?.name ?? 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session?.user?.email ?? ''}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/login' })}
              className={cn(
                'p-1.5 rounded-md text-muted-foreground/60',
                'hover:text-destructive hover:bg-destructive/10',
                'transition-all duration-150 shrink-0',
              )}
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
