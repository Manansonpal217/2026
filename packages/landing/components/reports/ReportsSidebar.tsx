'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string }

const SECTIONS: { id: string; title: string; items: NavItem[] }[] = [
  {
    id: 'productivity',
    title: 'Productivity',
    items: [
      { href: '/myhome/reports/productivity/summary', label: 'Summary' },
      { href: '/myhome/reports/productivity/app-breakdown', label: 'App Breakdown' },
      { href: '/myhome/reports/productivity/hourly-heatmap', label: 'Hourly Heatmap' },
      { href: '/myhome/reports/productivity/idle-time', label: 'Idle Time' },
      { href: '/myhome/reports/productivity/streaks', label: 'Streaks' },
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance',
    items: [
      { href: '/myhome/reports/attendance/daily-log', label: 'Daily Log' },
      { href: '/myhome/reports/attendance/late-start', label: 'Late Start' },
      { href: '/myhome/reports/attendance/offline-time', label: 'Offline Time' },
      { href: '/myhome/reports/attendance/overtime', label: 'Overtime' },
      { href: '/myhome/reports/attendance/absenteeism', label: 'Absenteeism' },
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    items: [
      { href: '/myhome/reports/projects/allocation', label: 'Allocation' },
      { href: '/myhome/reports/projects/budget-vs-actuals', label: 'Budget vs Actuals' },
      { href: '/myhome/reports/projects/task-accuracy', label: 'Task Accuracy' },
      { href: '/myhome/reports/projects/user-contribution', label: 'User Contribution' },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    items: [
      { href: '/myhome/reports/compliance/screenshot-audit', label: 'Screenshot Audit' },
      { href: '/myhome/reports/compliance/manual-time', label: 'Manual Time' },
      { href: '/myhome/reports/compliance/audit-log', label: 'Audit Log' },
      { href: '/myhome/reports/compliance/data-retention', label: 'Data Retention' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    items: [
      { href: '/myhome/reports/billing/billable-hours', label: 'Billable Hours' },
      { href: '/myhome/reports/billing/cost-estimate', label: 'Cost Estimate' },
      { href: '/myhome/reports/billing/seat-utilization', label: 'Seat Utilization' },
    ],
  },
]

export function ReportsSidebar() {
  const pathname = usePathname() ?? ''

  const defaultOpen = SECTIONS.filter((s) => s.items.some((i) => pathname.startsWith(i.href))).map(
    (s) => s.id
  )

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-muted/20 lg:block">
      <div className="sticky top-0 max-h-[calc(100vh-4rem)] overflow-y-auto py-4 pl-3 pr-2">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reports
        </p>
        <Link
          href="/myhome/reports"
          className={cn(
            'mb-3 block rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/myhome/reports'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          Overview
        </Link>
        <Accordion
          type="multiple"
          defaultValue={defaultOpen.length ? defaultOpen : ['productivity']}
          className="w-full"
        >
          {SECTIONS.map((section) => (
            <AccordionItem key={section.id} value={section.id} className="border-border/60">
              <AccordionTrigger className="py-2 pl-3 pr-2 text-sm font-semibold hover:no-underline">
                {section.title}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  ({section.items.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-2 pt-0">
                <nav className="flex flex-col gap-0.5 pl-2">
                  {section.items.map((item) => {
                    const active = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </nav>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </aside>
  )
}
