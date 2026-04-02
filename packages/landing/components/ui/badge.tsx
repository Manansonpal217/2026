import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        warning: 'border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-400',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        indigo: 'border-transparent bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
        violet: 'border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300',
        emerald: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
