'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/admin/orgs', label: 'Organizations', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
]

export function AdminSubNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3" aria-label="Platform admin">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
