'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calendar, Filter, Search, Users, X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { isManagerOrAbove } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type DatePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_7d'
  | 'last_30d'
  | 'custom'

function computeDateRange(preset: DatePreset, customFrom: string, customTo: string) {
  const now = new Date()
  switch (preset) {
    case 'today': {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { from: s.toISOString(), to: now.toISOString() }
    }
    case 'this_week': {
      const day = now.getDay()
      const mon = new Date(now)
      mon.setDate(now.getDate() - day + (day === 0 ? -6 : 1))
      mon.setHours(0, 0, 0, 0)
      return { from: mon.toISOString(), to: now.toISOString() }
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: s.toISOString(), to: now.toISOString() }
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { from: s.toISOString(), to: e.toISOString() }
    }
    case 'last_7d': {
      const s = new Date(now)
      s.setDate(s.getDate() - 7)
      s.setHours(0, 0, 0, 0)
      return { from: s.toISOString(), to: now.toISOString() }
    }
    case 'last_30d': {
      const s = new Date(now)
      s.setDate(s.getDate() - 30)
      s.setHours(0, 0, 0, 0)
      return { from: s.toISOString(), to: now.toISOString() }
    }
    case 'custom': {
      const s = customFrom
        ? new Date(customFrom + 'T00:00:00')
        : new Date(now.getFullYear(), now.getMonth(), 1)
      const e = customTo ? new Date(customTo + 'T23:59:59.999') : now
      return { from: s.toISOString(), to: e.toISOString() }
    }
  }
}

type TeamUser = { id: string; name: string; email: string }

export type ReportFilterValues = {
  from: string
  to: string
  userIds: string[]
  projectIds: string[]
}

type ReportFiltersProps = {
  onChange: (filters: ReportFilterValues) => void
  showUsers?: boolean
  showProjects?: boolean
  defaultPreset?: DatePreset
  children?: React.ReactNode
}

export function ReportFilters({
  onChange,
  showUsers = true,
  showProjects = false,
  defaultPreset = 'this_month',
  children,
}: ReportFiltersProps) {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const isManager = isManagerOrAbove(role)

  const [preset, setPreset] = useState<DatePreset>(defaultPreset)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (isManager && showUsers) {
      api
        .get<{ users: TeamUser[] }>('/v1/dashboard/team-summary')
        .then(({ data }) => setTeamUsers(data.users ?? []))
        .catch(() => {})
    }
    if (showProjects) {
      api
        .get<{ projects: { id: string; name: string }[] }>('/v1/projects')
        .then(({ data }) => setProjects(data.projects ?? []))
        .catch(() => {})
    }
  }, [isManager, showUsers, showProjects])

  const emitChange = useCallback(() => {
    const range = computeDateRange(preset, customFrom, customTo)
    onChange({
      from: range.from,
      to: range.to,
      userIds: selectedUserIds,
      projectIds: selectedProjectIds,
    })
  }, [preset, customFrom, customTo, selectedUserIds, selectedProjectIds, onChange])

  useEffect(() => {
    emitChange()
  }, [emitChange])

  const presets: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'this_week', label: 'This week' },
    { key: 'last_7d', label: 'Last 7d' },
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'last_30d', label: 'Last 30d' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      {/* Date presets */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Date range
        </label>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                preset === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Start
            </label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              End
            </label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* User selector (managers+) */}
      {showUsers && isManager && teamUsers.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            User
          </label>
          <select
            value={selectedUserIds[0] ?? ''}
            onChange={(e) => setSelectedUserIds(e.target.value ? [e.target.value] : [])}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All team</option>
            {teamUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Project selector */}
      {showProjects && projects.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Project
          </label>
          <select
            value={selectedProjectIds[0] ?? ''}
            onChange={(e) => setSelectedProjectIds(e.target.value ? [e.target.value] : [])}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {children}
    </div>
  )
}
