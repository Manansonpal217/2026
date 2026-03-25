import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground',
          'placeholder:text-muted-foreground',
          'shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.04)]',
          'transition-all duration-200',
          'border-border',
          'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/45',
          'hover:border-border',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          error && 'border-destructive/60 focus:ring-destructive/30 focus:border-destructive/60',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
