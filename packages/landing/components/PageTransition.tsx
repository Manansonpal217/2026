'use client'

import { usePathname } from 'next/navigation'

/** Enter animation is CSS-only so main content never stays stuck at opacity 0 with App Router + RSC. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="page-transition-shell w-full">
      {children}
    </div>
  )
}
