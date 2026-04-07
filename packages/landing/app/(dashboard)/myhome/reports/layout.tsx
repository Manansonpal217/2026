import type { ReactNode } from 'react'
import { ReportsSidebar } from '@/components/reports/ReportsSidebar'

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 gap-0 bg-muted/20">
      <ReportsSidebar />
      <div className="min-w-0 flex-1 px-3 py-5 sm:px-5 sm:py-6 md:px-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-border/50 bg-background p-5 shadow-sm sm:p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
