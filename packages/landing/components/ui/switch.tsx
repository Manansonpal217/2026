'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, id, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-input',
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-background shadow-md ring-0 transition-transform',
            checked && 'translate-x-[1.375rem]'
          )}
        />
      </button>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
