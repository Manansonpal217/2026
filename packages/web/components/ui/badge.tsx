import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary border border-primary/25',
        secondary: 'bg-secondary text-secondary-foreground border border-border',
        destructive: 'bg-destructive/15 text-destructive border border-destructive/25',
        success: 'bg-success/15 text-success border border-success/25',
        warning: 'bg-warning/15 text-warning border border-warning/25',
        outline: 'border border-border text-muted-foreground',
        // Role variants
        super_admin: 'bg-violet-500/15 text-violet-300 border border-violet-500/25',
        admin: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
        manager: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
        employee: 'bg-slate-500/15 text-slate-300 border border-slate-500/25',
        // Status variants
        active: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
        invited: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
        suspended: 'bg-red-500/15 text-red-300 border border-red-500/25',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'active' && 'bg-emerald-400',
            variant === 'invited' && 'bg-amber-400',
            variant === 'suspended' && 'bg-red-400',
            variant === 'success' && 'bg-success',
            variant === 'destructive' && 'bg-destructive',
            variant === 'warning' && 'bg-warning',
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
