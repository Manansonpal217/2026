'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Clock, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

interface TimeData {
  today: number
  week: number
  month: number
  sessions: Array<{
    id: string
    started_at: string
    duration_sec: number
    project?: { name: string }
  }>
}

export function PersonalActivityPanel() {
  const { data: session } = useSession()
  const [data, setData] = useState<TimeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) return

    const loadData = async () => {
      try {
        const res = await api.get('/v1/app/dashboard')
        setData(res.data)
      } catch (err) {
        console.error('Failed to load personal activity:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [session?.user?.id])

  const formatHours = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${mins}m`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-lg bg-muted/50" />
        <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome, {session?.user?.name}
        </h1>
        <p className="mt-2 text-muted-foreground">View your activity and time tracking</p>
      </div>

      {/* Time Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data ? formatHours(data.today) : '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              This week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data ? formatHours(data.week) : '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              This month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data ? formatHours(data.month) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.sessions && data.sessions.length > 0 ? (
            <div className="space-y-3">
              {data.sessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{session.project?.name || 'No project'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.started_at).toLocaleDateString()}{' '}
                      {new Date(session.started_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatHours(session.duration_sec)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sessions yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
