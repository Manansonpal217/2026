'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Clock, Camera, TrendingUp, Shield } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ScreenshotGallery } from '@/components/ScreenshotGallery'
import { TimeBarChart } from '@/components/reports/TimeBarChart'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  status: string
}

interface Screenshot {
  id: string
  taken_at: string
  activity_score: number
  is_blurred: boolean
  signed_url: string
  file_size_bytes: number
}

interface TimeDataPoint {
  label: string
  seconds: number
  sessions: number
}

function secToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function TeamMemberPage({ params }: { params: { userId: string } }) {
  const { data: session } = useSession()
  const [member, setMember] = useState<TeamMember | null>(null)
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [timeData, setTimeData] = useState<TimeDataPoint[]>([])
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [suspending, setSuspending] = useState(false)

  const token = (session as { access_token?: string })?.access_token

  useEffect(() => {
    async function fetchAll() {
      if (!token) return
      setLoading(true)

      const from = new Date()
      from.setDate(from.getDate() - 7)
      const fromStr = from.toISOString().split('T')[0]
      const toStr = new Date().toISOString().split('T')[0]

      const [usersRes, screenshotRes, timeRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/v1/screenshots?user_id=${params.userId}&from=${fromStr}T00:00:00.000Z&to=${toStr}T23:59:59.000Z&limit=12`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/v1/reports/time?user_id=${params.userId}&from=${fromStr}T00:00:00.000Z&to=${toStr}T23:59:59.000Z&group_by=day`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (usersRes.ok) {
        const { users } = await usersRes.json()
        setMember(users.find((u: TeamMember) => u.id === params.userId) ?? null)
      }
      if (screenshotRes.ok) setScreenshots((await screenshotRes.json()).screenshots)
      if (timeRes.ok) {
        const data = await timeRes.json()
        setTimeData(data.breakdown)
        setTotalSeconds(data.total_seconds)
      }
      setLoading(false)
    }
    fetchAll()
  }, [token, params.userId])

  async function suspendUser() {
    if (!token || !member) return
    setSuspending(true)
    await fetch(`${API_URL}/v1/admin/users/${member.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setMember((m) => m ? { ...m, status: 'suspended' } : m)
    setSuspending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!member) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        User not found.
        <Link href="/admin/team" className="block mt-2 text-primary hover:underline text-sm">
          ← Back to Team
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/team">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{member.name}</h1>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
              member.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>
              {member.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{member.email} · {member.role}</p>
        </div>
        {member.status === 'active' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={suspending}
            onClick={suspendUser}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            {suspending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}
            Suspend
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border/50 bg-surface/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">This Week</span>
          </div>
          <p className="text-xl font-bold">{secToHms(totalSeconds)}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/50 bg-surface/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Screenshots</span>
          </div>
          <p className="text-xl font-bold">{screenshots.length}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/50 bg-surface/50">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Score</span>
          </div>
          <p className="text-xl font-bold">
            {screenshots.length > 0
              ? Math.round(screenshots.reduce((a, s) => a + s.activity_score, 0) / screenshots.length)
              : '—'}%
          </p>
        </div>
      </div>

      {/* Time chart */}
      {timeData.length > 0 && (
        <div className="p-4 rounded-xl border border-border/50 bg-surface/50">
          <h2 className="text-sm font-semibold mb-4">Time This Week</h2>
          <TimeBarChart data={timeData} />
        </div>
      )}

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-4">Recent Screenshots (last 24h)</h2>
          <ScreenshotGallery screenshots={screenshots} showBlur />
        </div>
      )}
    </div>
  )
}
