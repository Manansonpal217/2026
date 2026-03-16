'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Search, MoreHorizontal, Users, Mail, CheckCircle2 } from 'lucide-react'
import { InviteModal } from './invite-modal'
import { Avatar, AvatarFallback, getAvatarGradient } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at: string
}

function getInitials(name: string, email: string): string {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return email.charAt(0).toUpperCase()
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function MemberRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="skeleton h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="skeleton h-3.5 w-32 rounded" />
        <div className="skeleton h-3 w-48 rounded" />
      </div>
      <div className="hidden sm:flex items-center gap-3">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="skeleton h-4 w-20 rounded hidden md:block" />
    </div>
  )
}

export default function TeamPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')

  const accessToken = (session as { access_token?: string })?.access_token

  const { data: members, isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team'],
    enabled: !!accessToken,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/users?limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error('Failed to fetch team')
      const data = await res.json()
      return data.users as TeamMember[]
    },
  })

  const { data: streaksData } = useQuery<{ users: { id: string; streak: number }[] }>({
    queryKey: ['admin-streaks'],
    enabled: !!accessToken,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/admin/streaks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error('Failed to fetch streaks')
      return res.json()
    },
  })

  const streakMap = new Map((streaksData?.users ?? []).map((u) => [u.id, u.streak]))

  const handleInviteSuccess = useCallback(() => {
    setShowInviteModal(false)
    setSuccessMessage('Invitation sent! Your colleague will receive an email shortly.')
    queryClient.invalidateQueries({ queryKey: ['team'] })
    setTimeout(() => setSuccessMessage(''), 5000)
  }, [queryClient])

  const filtered = members?.filter(
    (m) =>
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Team</h1>
          <p className="text-sm text-muted-foreground">
            Manage members, roles, and access permissions
          </p>
        </div>
        <Button variant="gradient" onClick={() => setShowInviteModal(true)} className="shrink-0">
          <UserPlus className="h-4 w-4" />
          Invite member
        </Button>
      </div>

      {/* Success toast */}
      {successMessage && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3',
            'animate-fade-in-up'
          )}
        >
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <p className="text-sm text-success/90">{successMessage}</p>
        </div>
      )}

      {/* Table card */}
      <div
        className="rounded-xl border border-border/60 bg-card overflow-hidden animate-fade-in-up shadow-card"
        style={{ animationDelay: '0.1s' }}
      >
        {/* Table header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Members</h2>
            {members && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                {members.length}
              </span>
            )}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-2.5 border-b border-border/30 bg-surface/50">
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
            Member
          </span>
          <span
            className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-16 text-center"
            title="Consecutive days the user opened TrackSync and tracked time. Each day with at least one completed session counts."
          >
            Streak
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-24 text-center">
            Role
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-20 text-center">
            Status
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider w-28">
            Joined
          </span>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="divide-y divide-border/30">
            {Array.from({ length: 3 }).map((_, i) => (
              <MemberRowSkeleton key={i} />
            ))}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <ul className="divide-y divide-border/30">
            {filtered.map((member, idx) => (
              <li
                key={member.id}
                className={cn(
                  'group flex items-center gap-4 px-6 py-4',
                  'hover:bg-white/[0.02] transition-colors duration-150',
                  'animate-fade-in-up'
                )}
                style={{ animationDelay: `${0.05 * idx}s` }}
              >
                {/* Avatar + info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback
                      className={cn(
                        'text-xs font-semibold bg-gradient-to-br',
                        getAvatarGradient(member.role)
                      )}
                    >
                      {getInitials(member.name, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {member.name || <span className="text-muted-foreground italic">No name</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Mail className="h-2.5 w-2.5 shrink-0" />
                      {member.email}
                    </p>
                  </div>
                </div>

                {/* Streak */}
                <div
                  className="hidden md:flex w-16 justify-center items-center gap-1"
                  title={`${streakMap.get(member.id) ?? 0} day streak — consecutive days with tracked time`}
                >
                  <span>🔥</span>
                  <span className="text-xs font-medium tabular-nums text-foreground">
                    {streakMap.get(member.id) ?? 0}
                  </span>
                </div>

                {/* Role badge */}
                <div className="w-24 flex justify-center">
                  <Badge
                    variant={
                      (member.role as 'super_admin' | 'admin' | 'manager' | 'employee') ??
                      'employee'
                    }
                  >
                    {member.role?.replace('_', ' ')}
                  </Badge>
                </div>

                {/* Status badge */}
                <div className="w-20 flex justify-center">
                  <Badge
                    variant={(member.status as 'active' | 'invited' | 'suspended') ?? 'active'}
                    dot
                  >
                    {member.status}
                  </Badge>
                </div>

                {/* Joined date */}
                <div className="w-28 hidden md:block">
                  <p className="text-xs text-muted-foreground">
                    {member.created_at ? formatDate(member.created_at) : '—'}
                  </p>
                </div>

                {/* Actions */}
                <button
                  className={cn(
                    'p-1.5 rounded-md text-muted-foreground/40',
                    'hover:text-foreground hover:bg-white/5',
                    'opacity-0 group-hover:opacity-100',
                    'transition-all duration-150'
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
              <Users className="h-7 w-7 text-primary/60" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">No members found</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {search
                  ? `No results for "${search}". Try a different search term.`
                  : 'Your team is empty. Invite someone to get started.'}
              </p>
            </div>
            {!search && (
              <Button variant="outline" size="sm" onClick={() => setShowInviteModal(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Invite first member
              </Button>
            )}
          </div>
        )}
      </div>

      <InviteModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={handleInviteSuccess}
      />
    </div>
  )
}
