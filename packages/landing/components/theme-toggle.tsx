'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Check, Laptop, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Laptop },
]

export function ThemeToggle({
  className,
  buttonClassName,
}: {
  className?: string
  buttonClassName?: string
}) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!mounted) {
    return (
      <div
        className={cn('h-9 w-9 shrink-0 rounded-lg border border-transparent', className)}
        aria-hidden
      />
    )
  }

  const current = items.find((i) => i.value === theme) ?? items[2]
  const CurrentIcon = current.icon

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-muted/40 text-foreground transition-colors hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          buttonClassName
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Theme: ${current.label}. Open menu`}
      >
        <CurrentIcon className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-[100] min-w-[10.5rem] rounded-xl border border-border bg-card p-1 shadow-lg shadow-foreground/5"
        >
          {items.map(({ value, label, icon: Icon }) => (
            <li key={value} role="option" aria-selected={theme === value}>
              <button
                type="button"
                onClick={() => {
                  setTheme(value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-card-foreground transition-colors hover:bg-muted',
                  theme === value && 'bg-muted/80'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="flex-1">{label}</span>
                {theme === value ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
