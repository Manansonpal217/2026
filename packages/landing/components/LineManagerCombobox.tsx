'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { orgMemberRoleDisplayLabel } from '@/lib/roles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type LineManagerOption = { id: string; name: string; email: string; role: string }

/** Use design-system badge variants for reliable light/dark contrast (avoid stacking on `outline`). */
function roleBadgeVariant(role: string): 'indigo' | 'violet' | 'default' | 'secondary' {
  switch (role) {
    case 'super_admin':
      return 'indigo'
    case 'admin':
      return 'violet'
    case 'manager':
      return 'default'
    default:
      return 'secondary'
  }
}

function optionSearchBlob(m: LineManagerOption): string {
  return `${m.email} ${m.name ?? ''} ${orgMemberRoleDisplayLabel(m.role)}`
}

function OptionRows({ m }: { m: LineManagerOption }) {
  const name = (m.name ?? '').trim()
  const roleLabel = orgMemberRoleDisplayLabel(m.role)
  return (
    <span className="min-w-0 flex-1 text-left">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate font-medium text-foreground">{name || m.email}</span>
        <Badge
          variant={roleBadgeVariant(m.role)}
          className="shrink-0 px-2 py-0.5 text-[11px] font-semibold leading-tight"
        >
          {roleLabel}
        </Badge>
      </span>
      {name ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.email}</span>
      ) : null}
    </span>
  )
}

export function LineManagerCombobox({
  id,
  label,
  value,
  onValueChange,
  options,
  disabled,
  loading,
  placeholder = 'Choose who they report to…',
  emptyText = 'No managers match your search.',
  noOptionsText = 'No eligible line managers in this organization.',
  helperText,
  allowNone,
  noneLabel = 'No line manager',
  className,
}: {
  id: string
  label: string
  value: string
  onValueChange: (id: string) => void
  options: LineManagerOption[]
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  emptyText?: string
  noOptionsText?: string
  helperText?: string
  allowNone?: boolean
  noneLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined)

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value])

  useLayoutEffect(() => {
    if (!open) return
    const el = triggerRef.current
    if (!el) return
    const w = Math.round(el.getBoundingClientRect().width)
    setMenuWidth(w > 0 ? w : undefined)
  }, [open, options.length, value])

  const triggerDisabled = Boolean(disabled || loading)
  const showEmptyState = !loading && options.length === 0

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {/* `modal={false}` avoids focus conflicts when this combobox is used inside a `Dialog`. */}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setMenuWidth(undefined)
        }}
        modal={false}
      >
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={triggerDisabled}
            className={cn(
              'h-auto min-h-11 w-full max-w-none justify-between gap-2 py-2.5 pl-3 pr-2 text-left font-normal',
              'border-input bg-background hover:bg-muted/40'
            )}
          >
            <span className="min-w-0 flex-1">
              {loading ? (
                <span className="text-sm text-muted-foreground">Loading managers…</span>
              ) : showEmptyState ? (
                <span className="text-sm text-muted-foreground">{noOptionsText}</span>
              ) : allowNone && value === '' ? (
                <span className="text-sm text-muted-foreground">{noneLabel}</span>
              ) : selected ? (
                <OptionRows m={selected} />
              ) : (
                <span className="text-sm text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="max-h-[min(320px,50vh)] max-w-[min(calc(100vw-2rem),28rem)] overflow-hidden p-0"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          style={menuWidth != null ? { width: menuWidth } : undefined}
        >
          <Command>
            <CommandInput placeholder="Search by name or email…" />
            <CommandList>
              <CommandEmpty>{options.length === 0 ? noOptionsText : emptyText}</CommandEmpty>
              <CommandGroup>
                {allowNone ? (
                  <CommandItem
                    value={`__none__ ${noneLabel}`}
                    onSelect={() => {
                      onValueChange('')
                      setOpen(false)
                    }}
                  >
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 shrink-0 items-center justify-center',
                        value === '' ? 'text-primary' : 'text-transparent'
                      )}
                      aria-hidden
                    >
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-muted-foreground">{noneLabel}</span>
                  </CommandItem>
                ) : null}
                {options.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={optionSearchBlob(m)}
                    onSelect={() => {
                      onValueChange(m.id)
                      setOpen(false)
                    }}
                  >
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 shrink-0 items-center justify-center',
                        value === m.id ? 'text-primary' : 'text-transparent'
                      )}
                      aria-hidden
                    >
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <OptionRows m={m} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  )
}
