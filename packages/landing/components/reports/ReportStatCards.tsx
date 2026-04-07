'use client'

import type { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type StatCardDef = {
  label: string
  value: string | number
  icon: LucideIcon
  accent: string // e.g. 'border-l-blue-500'
  iconColor?: string // e.g. 'text-blue-500'
  subtitle?: string
}

export function ReportStatCards({ cards, loading }: { cards: StatCardDef[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {cards.map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid gap-3',
        cards.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'
      )}
    >
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className={cn(
              'rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-4 shadow-sm border-l-2',
              card.accent
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </p>
              <Icon className={cn('h-4 w-4', card.iconColor ?? 'text-muted-foreground')} />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{card.value}</p>
            {card.subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{card.subtitle}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
