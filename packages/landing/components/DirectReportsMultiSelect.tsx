'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type DirectReportOption = { id: string; name: string; email: string; role: string }

function roleLabel(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super admin'
    case 'admin':
      return 'Admin'
    case 'manager':
      return 'Manager'
    case 'employee':
      return 'Employee'
    default:
      return role
  }
}

export function DirectReportsMultiSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: DirectReportOption[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  const selected = value
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as DirectReportOption[]

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((i) => i !== id) : [...value, id])
  }

  function remove(id: string) {
    onChange(value.filter((i) => i !== id))
  }

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-10 w-full max-w-none justify-between py-2 text-left font-normal"
          >
            <span className="truncate text-muted-foreground">
              Search and add people who report to this manager…
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,380px)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search name or email…" />
            <CommandList>
              <CommandEmpty>No people match.</CommandEmpty>
              <CommandGroup heading="Organization members">
                {options.map((o) => {
                  const isOn = value.includes(o.id)
                  return (
                    <CommandItem
                      key={o.id}
                      value={`${o.name} ${o.email} ${roleLabel(o.role)}`}
                      onSelect={() => {
                        toggle(o.id)
                      }}
                    >
                      <span
                        className={cn(
                          'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border',
                          isOn && 'border-primary bg-primary text-primary-foreground'
                        )}
                        aria-hidden
                      >
                        {isOn ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.email} · {roleLabel(o.role)}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border/80 bg-muted/20 p-3">
          {selected.map((o) => (
            <Badge
              key={o.id}
              variant="secondary"
              className="max-w-full gap-1 py-1 pl-2.5 pr-1 font-normal"
            >
              <span className="truncate">{o.name}</span>
              <button
                type="button"
                disabled={disabled}
                className="rounded p-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground disabled:pointer-events-none"
                aria-label={`Remove ${o.name}`}
                onClick={() => remove(o.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No direct reports yet. Use the field above to assign employees or managers.
        </p>
      )}
    </div>
  )
}
