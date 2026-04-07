'use client'

import type { ComponentProps } from 'react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner } from 'sonner'
import { cn } from '@/lib/utils'

type ToasterProps = ComponentProps<typeof Sonner>

/** Enterprise-style toast: horizontal icon + copy, generous padding, subtle surface + accent edge */
const baseToast = cn(
  'w-full min-w-[min(100%,17.5rem)] max-w-[26rem]',
  'rounded-xl border shadow-xl shadow-black/[0.06] dark:shadow-black/25',
  'backdrop-blur-xl bg-card/95 dark:bg-card/90',
  'flex flex-row items-start gap-3.5 px-5 py-4 sm:px-6 sm:py-[1.125rem]',
  'ring-1 ring-border/40 dark:ring-border/50',
  '[transform:translateZ(0)]'
)

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-center"
      richColors={false}
      closeButton={false}
      offset="1.5rem"
      gap={14}
      toastOptions={{
        duration: 4500,
        closeButton: false,
        classNames: {
          toast: baseToast,
          content: 'flex min-w-0 flex-1 flex-col gap-0.5 text-left',
          title: cn(
            'text-[0.9375rem] font-medium leading-snug tracking-tight text-foreground',
            'sm:text-base'
          ),
          description: 'text-sm leading-relaxed text-muted-foreground',
          icon: 'mt-0.5 size-[22px] shrink-0 [&_svg]:size-[22px]',
          success: cn(
            'border-emerald-600/25 bg-gradient-to-br from-emerald-500/[0.07] via-card/95 to-card/95',
            'dark:border-emerald-500/30 dark:from-emerald-500/[0.12] dark:via-card/90 dark:to-card/90',
            'ring-emerald-500/15'
          ),
          error: cn(
            'border-destructive/30 bg-gradient-to-br from-destructive/[0.08] via-card/95 to-card/95',
            'dark:from-destructive/[0.12] dark:via-card/90 dark:to-card/90',
            'ring-destructive/15'
          ),
          warning: cn(
            'border-amber-600/25 bg-gradient-to-br from-amber-500/[0.08] via-card/95 to-card/95',
            'dark:border-amber-500/30 dark:from-amber-500/[0.1] dark:via-card/90 dark:to-card/90',
            'ring-amber-500/15'
          ),
          info: cn(
            'border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card/95 to-card/95',
            'dark:border-primary/35 dark:from-primary/[0.1] dark:via-card/90 dark:to-card/90',
            'ring-primary/15'
          ),
          actionButton:
            'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90',
          cancelButton:
            'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted',
        },
      }}
      {...props}
    />
  )
}
