'use client'

import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => number | string
  align?: 'left' | 'right' | 'center'
  className?: string
}

type ReportTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  loading: boolean
  keyField: string
  emptyMessage?: string
  skeletonRows?: number
}

export function ReportTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  keyField,
  emptyMessage = 'No data available',
  skeletonRows = 5,
}: ReportTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return data
    const sv = col.sortValue
    return [...data].sort((a, b) => {
      const va = sv(a)
      const vb = sv(b)
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir, columns])

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="p-4 space-y-2">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-12 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 font-medium text-muted-foreground',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.sortable && 'cursor-pointer select-none hover:text-foreground',
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable &&
                      (sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sorted.map((row) => (
              <tr key={String(row[keyField])} className="transition-colors hover:bg-muted/20">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
