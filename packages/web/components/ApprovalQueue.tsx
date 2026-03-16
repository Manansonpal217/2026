'use client'

import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { CheckCircle, XCircle, Clock, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface PendingSession {
  id: string
  user: { id: string; name: string; email: string }
  project?: { name: string; color: string } | null
  task?: { name: string } | null
  started_at: string
  ended_at: string
  duration_sec: number
  notes?: string | null
}

interface Props {
  sessions: PendingSession[]
  onApprove: (id: string) => Promise<void>
  onReject: (id: string, reason: string) => Promise<void>
  isLoading?: boolean
}

function secToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

const columnHelper = createColumnHelper<PendingSession>()

export function ApprovalQueue({ sessions, onApprove, onReject, isLoading }: Props) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const columns = [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="rounded border-border/50 bg-surface accent-indigo-500"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="rounded border-border/50 bg-surface accent-indigo-500"
        />
      ),
    }),
    columnHelper.accessor((row) => row.user.name, {
      id: 'user',
      header: 'Employee',
      cell: (info) => (
        <div>
          <p className="text-sm font-medium">{info.getValue()}</p>
          <p className="text-xs text-muted-foreground">{info.row.original.user.email}</p>
        </div>
      ),
    }),
    columnHelper.accessor((row) => row.project?.name ?? '—', {
      id: 'project',
      header: 'Project / Task',
      cell: (info) => (
        <div>
          <p className="text-sm">{info.getValue()}</p>
          {info.row.original.task && (
            <p className="text-xs text-muted-foreground">{info.row.original.task.name}</p>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('started_at', {
      header: 'Date',
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {new Date(info.getValue()).toLocaleDateString()}
        </span>
      ),
    }),
    columnHelper.accessor('duration_sec', {
      header: 'Duration',
      cell: (info) => (
        <span className="text-sm font-mono">{secToHms(info.getValue())}</span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const session = row.original
        const loading = busy[session.id]
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={async () => {
                setBusy((p) => ({ ...p, [session.id]: true }))
                await onApprove(session.id)
                setBusy((p) => ({ ...p, [session.id]: false }))
              }}
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => { setRejectTarget(session.id); setRejectReason('') }}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Reject
            </Button>
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: sessions,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  })

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k])

  return (
    <>
      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="mb-3 flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
          <Clock className="h-4 w-4 text-indigo-400" />
          <span className="text-sm text-indigo-300">{selectedIds.length} selected</span>
          <Button
            size="sm"
            onClick={async () => {
              for (const id of selectedIds) await onApprove(id)
              setRowSelection({})
            }}
            className="ml-auto h-7 text-xs"
          >
            Approve All
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Loading pending approvals…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <CheckCircle className="h-10 w-10 text-emerald-500/40" />
          <p className="text-muted-foreground text-sm">All caught up! No pending approvals.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border/50">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && <ChevronUp className="h-3 w-3" />}
                        {header.column.getIsSorted() === 'desc' && <ChevronDown className="h-3 w-3" />}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/30 hover:bg-white/3 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null) }}>
        <DialogContent className="bg-surface border-border/50">
          <DialogHeader>
            <DialogTitle>Reject Time Session</DialogTitle>
          </DialogHeader>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Reason for rejection <span className="text-red-400">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-24 bg-surface/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Explain why this session is being rejected…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!rejectReason.trim()}
              onClick={async () => {
                if (!rejectTarget) return
                setBusy((p) => ({ ...p, [rejectTarget]: true }))
                await onReject(rejectTarget, rejectReason)
                setBusy((p) => ({ ...p, [rejectTarget]: false }))
                setRejectTarget(null)
                setRejectReason('')
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Reject Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
