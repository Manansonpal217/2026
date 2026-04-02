import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[120px] w-full rounded-lg border border-border bg-input px-3 py-3 text-sm text-foreground',
          'placeholder:text-muted-foreground',
          'shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.04)]',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/45',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-y',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
