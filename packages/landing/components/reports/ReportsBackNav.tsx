'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

/** Shown on nested `/myhome/reports/...` routes so users can return to the reports hub. */
export function ReportsBackNav() {
  const pathname = usePathname() ?? ''
  const isReportsHub = pathname === '/myhome/reports' || pathname === '/myhome/reports/'
  if (isReportsHub) return null

  return (
    <nav className="mb-6 border-b border-border/60 pb-4" aria-label="Reports navigation">
      <Link
        href="/myhome/reports"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to reports overview
      </Link>
    </nav>
  )
}
