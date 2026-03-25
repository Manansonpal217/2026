import { useEffect, useState } from 'react'
import { BarChart3, Clock, RefreshCw, Calendar, TrendingUp, Ticket, Edit3 } from 'lucide-react'
import { formatNotesForDisplay, isJiraTask } from '../lib/format'

interface LocalSession {
  id: string
  started_at: string
  ended_at: string | null
  duration_sec: number
  project_id: string | null
  notes: string | null
  synced: number
}

function formatDuration(sec: number): string {
  if (sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

interface DaySummary {
  label: string
  totalSec: number
  sessions: LocalSession[]
}

function groupByDay(sessions: LocalSession[]): DaySummary[] {
  const map = new Map<string, DaySummary>()
  for (const s of sessions) {
    const key = s.started_at.slice(0, 10)
    const existing = map.get(key)
    if (existing) {
      existing.totalSec += s.duration_sec
      existing.sessions.push(s)
    } else {
      map.set(key, {
        label: formatDate(s.started_at),
        totalSec: s.duration_sec,
        sessions: [s],
      })
    }
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v)
}

export default function ReportsPage() {
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const rows = (await window.electron?.ipcRenderer.invoke('sessions:list-all-local')) as
          | LocalSession[]
          | undefined
        setSessions(rows ?? [])
      } catch {
        setSessions([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const grouped = groupByDay(sessions)
  const totalThisWeek = sessions
    .filter((s) => {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      return new Date(s.started_at).getTime() >= weekAgo
    })
    .reduce((sum, s) => sum + s.duration_sec, 0)

  const pending = sessions.filter((s) => s.synced === 0).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-[#f9fafb]">Reports</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-indigo-400" />
                <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">
                  This Week
                </span>
              </div>
              <p className="text-xl font-bold text-[#f9fafb] tabular-nums">
                {formatDuration(totalThisWeek)}
              </p>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-indigo-400" />
                <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">
                  Sessions
                </span>
              </div>
              <p className="text-xl font-bold text-[#f9fafb] tabular-nums">{sessions.length}</p>
              {pending > 0 && <p className="text-[10px] text-amber-400">{pending} pending sync</p>}
            </div>
          </div>

          {/* History */}
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Calendar className="h-8 w-8 text-[#4b5563]" />
              <div>
                <p className="text-sm font-semibold text-[#9ca3af]">No sessions recorded</p>
                <p className="text-xs text-[#4b5563] mt-1">
                  Start the timer to begin tracking time.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((day) => (
                <div key={day.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#9ca3af]">{day.label}</span>
                    <span className="text-xs font-bold text-indigo-400 tabular-nums">
                      {formatDuration(day.totalSec)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {day.sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]"
                      >
                        {isJiraTask(s.notes) ? (
                          <Ticket className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        ) : (
                          <Edit3 className="h-3.5 w-3.5 text-[#6b7280] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#d1d5db] truncate">
                            {formatNotesForDisplay(s.notes) || 'No notes'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#f9fafb] tabular-nums">
                            {formatDuration(s.duration_sec)}
                          </span>
                          {s.synced === 0 ? (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"
                              title="Pending sync"
                            />
                          ) : (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"
                              title="Synced"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
