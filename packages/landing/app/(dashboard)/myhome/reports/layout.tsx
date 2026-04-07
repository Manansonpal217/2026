import type { ReactNode } from 'react'
import { ReportsBackNav } from '@/components/reports/ReportsBackNav'

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 bg-muted/20 px-3 py-5 sm:px-5 sm:py-6 md:px-8">
      <div className="mx-auto max-w-6xl rounded-2xl border border-border/50 bg-background p-5 shadow-sm sm:p-6 md:p-8">
        <ReportsBackNav />
        {children}
      </div>
    </div>
  )
}
