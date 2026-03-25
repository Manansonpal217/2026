import { useEffect, useState } from 'react'
import { Camera, RefreshCw, Image, Lock, Clock } from 'lucide-react'

interface ScreenshotRow {
  id: string
  taken_at: string
  activity_score: number
  session_id: string
  synced: number
  last_sync_error: string | null
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {Math.round(score)}%
    </span>
  )
}

function SyncBadge({ row }: { row: ScreenshotRow }) {
  if (row.synced === 1) {
    return (
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/25">
        Synced
      </span>
    )
  }
  if (row.last_sync_error) {
    return (
      <span
        className="text-[9px] font-medium px-1.5 py-0.5 rounded-full text-amber-400/95 bg-amber-500/10 border border-amber-500/25 max-w-[140px] truncate"
        title={row.last_sync_error}
      >
        Upload issue
      </span>
    )
  }
  return (
    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full text-[#9ca3af] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
      Pending upload
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
        <p className="text-xs text-[#4b5563] mt-1 max-w-sm leading-relaxed">
          {hasPermission
            ? 'Start the timer to capture. After upload, open the web app (Admin → Screenshots) to view images.'
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
  const [syncApiBase, setSyncApiBase] = useState<string | null>(null)

  useEffect(() => {
    window.electron?.ipcRenderer.invoke('sync:debug-info').then((r) => {
      const base = (r as { apiBase?: string })?.apiBase
      setSyncApiBase(base ?? null)
    })
  }, [])

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true)
    try {
      const rows = (await window.electron?.ipcRenderer.invoke('screenshots:list-local')) as
        | ScreenshotRow[]
        | undefined
      setScreenshots(rows ?? [])
    } catch {
      setScreenshots([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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

      <p
        className="text-[9px] text-[#4b5563] px-5 py-1.5 border-b border-[rgba(255,255,255,0.06)] font-mono truncate shrink-0"
        title={syncApiBase ?? undefined}
      >
        Sync API (VITE_API_URL): {syncApiBase ?? '—'}
      </p>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="h-5 w-5 text-[#4b5563] animate-spin" />
        </div>
      ) : screenshots.length === 0 ? (
        <EmptyState hasPermission />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[10px] text-[#6b7280] mb-2 leading-relaxed">
            Local queue (encrypted). After upload, the file is removed from this device; view
            thumbnails in the web app under{' '}
            <span className="text-[#9ca3af]">Admin → Screenshots</span>. Rows with &quot;Upload
            issue&quot; show an error on hover — check API URL, sign-in, and S3 config on the
            server.
          </p>
          <p className="text-[10px] text-[#6b7280] mb-3">
            {screenshots.length} row{screenshots.length === 1 ? '' : 's'} in local database
          </p>
          <div className="space-y-1.5">
            {screenshots.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                  <Image className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-[#f9fafb]">
                      {formatDate(s.taken_at)}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-[#6b7280]">
                      <Clock className="h-2.5 w-2.5" />
                      {formatTime(s.taken_at)}
                    </div>
                    <SyncBadge row={s} />
                  </div>
                  {s.last_sync_error ? (
                    <p
                      className="text-[10px] text-amber-500/80 mt-1 truncate"
                      title={s.last_sync_error}
                    >
                      {s.last_sync_error}
                    </p>
                  ) : null}
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
