import { useEffect, useState } from 'react'
import { Camera, RefreshCw, Image, Lock, Clock } from 'lucide-react'

interface ScreenshotRow {
  id: string
  taken_at: string
  activity_score: number
  is_blurred: boolean
  session_id: string
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {Math.round(score)}%
    </span>
  )
}

function EmptyState({ hasPermission }: { hasPermission: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
        {hasPermission ? (
          <Image className="h-7 w-7 text-[#4b5563]" />
        ) : (
          <Lock className="h-7 w-7 text-[#4b5563]" />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-[#9ca3af]">
          {hasPermission ? 'No screenshots yet' : 'Screenshots pending sync'}
        </p>
        <p className="text-xs text-[#4b5563] mt-1">
          {hasPermission
            ? 'Screenshots are captured while the timer is running.'
            : 'Screenshots are captured and synced to your organization account.'}
        </p>
      </div>
    </div>
  )
}

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true)
    try {
      const rows = await window.electron?.ipcRenderer.invoke('screenshots:list-local') as ScreenshotRow[] | undefined
      setScreenshots(rows ?? [])
    } catch {
      setScreenshots([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-[#f9fafb]">Screenshots</span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#9ca3af] hover:text-[#f9fafb] hover:bg-[rgba(255,255,255,0.06)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
        </div>
      ) : screenshots.length === 0 ? (
        <EmptyState hasPermission />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[10px] text-[#6b7280] mb-3">
            {screenshots.length} captured locally — synced to your organization account
          </p>
          <div className="space-y-1.5">
            {screenshots.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                  {s.is_blurred ? (
                    <Lock className="h-4 w-4 text-[#6b7280]" />
                  ) : (
                    <Image className="h-4 w-4 text-indigo-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#f9fafb]">{formatDate(s.taken_at)}</span>
                    <div className="flex items-center gap-1 text-[10px] text-[#6b7280]">
                      <Clock className="h-2.5 w-2.5" />
                      {formatTime(s.taken_at)}
                    </div>
                    {s.is_blurred && (
                      <span className="text-[9px] text-[#6b7280] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 rounded-full border border-[rgba(255,255,255,0.06)]">
                        blurred
                      </span>
                    )}
                  </div>
                </div>
                <ScoreBadge score={s.activity_score} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
