'use client'

import { usePathname } from 'next/navigation'
import { Bell, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const breadcrumbMap: Record<string, { label: string; parent?: string }> = {
  '/admin/dashboard': { label: 'Dashboard' },
  '/admin/team': { label: 'Team', parent: 'Dashboard' },
  '/admin/time': { label: 'Time Tracking', parent: 'Dashboard' },
  '/admin/screenshots': { label: 'Screenshots', parent: 'Dashboard' },
  '/admin/reports': { label: 'Reports', parent: 'Dashboard' },
  '/admin/settings': { label: 'Settings', parent: 'Dashboard' },
  '/admin/approvals': { label: 'Approvals', parent: 'Dashboard' },
  '/admin/integrations': { label: 'Integrations', parent: 'Dashboard' },
  '/admin/audit': { label: 'Audit Log', parent: 'Dashboard' },
}

export function Topbar() {
  const pathname = usePathname()
  const crumb = breadcrumbMap[pathname] ?? { label: 'Dashboard' }

  return (
    <header
      className={cn(
        'fixed top-0 left-60 right-0 z-20 h-14',
        'border-b border-border/50',
        'bg-surface/80 backdrop-blur-xl',
      )}
    >
      <div className="flex items-center justify-between h-full px-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          {crumb.parent && (
            <>
              <span className="text-muted-foreground/60">{crumb.parent}</span>
              <span className="text-muted-foreground/30">/</span>
            </>
          )}
          <span className="text-foreground font-medium">{crumb.label}</span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <button
            className={cn(
              'flex items-center gap-2 h-8 px-3 rounded-lg text-sm',
              'text-muted-foreground border border-border/50 bg-input/50',
              'hover:bg-input hover:border-border hover:text-foreground',
              'transition-all duration-150',
            )}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Search...</span>
            <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border border-border/50 bg-white/5 text-muted-foreground/60">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <button
            className={cn(
              'relative flex h-8 w-8 items-center justify-center rounded-lg',
              'text-muted-foreground border border-border/50',
              'hover:bg-white/5 hover:text-foreground hover:border-border',
              'transition-all duration-150',
            )}
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
        </div>
      </div>
    </header>
  )
}
