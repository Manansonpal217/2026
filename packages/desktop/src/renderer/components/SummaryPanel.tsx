import { useEffect, useState } from 'react'
import { X, Clock, Folder, Edit3, Ticket } from 'lucide-react'
import type { LocalSessionRow, TimerSession } from '../stores/timerStore'
import type { Project } from './ProjectPicker'
import { formatNotesForDisplay, isJiraTask } from '../lib/format'

interface SummaryPanelProps {
  isOpen: boolean
  onClose: () => void
  sessions: LocalSessionRow[]
  currentSession: TimerSession | null
  isRunning: boolean
  elapsedSeconds: number
  theme: 'light' | 'dark'
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function SummaryPanel({
  isOpen,
  onClose,
  sessions,
  currentSession,
  isRunning,
  elapsedSeconds,
  theme,
}: SummaryPanelProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  useEffect(() => {
    if (isOpen) {
      window.electron?.ipcRenderer.invoke('projects:list').then((list) => {
        setProjects((list as Project[]) ?? [])
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const completedSessions = sessions.filter((s) => s.ended_at)
  const totalSec =
    completedSessions.reduce((sum, s) => sum + s.duration_sec, 0) + (isRunning ? elapsedSeconds : 0)

  const isDark = theme === 'dark'

  return (
    <>
      {/* Backdrop — spreads from corner like light filling the room */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-spread-backdrop"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel — light spreads from top-right corner across entire screen */}
      <div
        className={`fixed inset-0 z-50 flex flex-col ${
          isDark ? 'bg-[#050508]' : 'bg-slate-50'
        } animate-spread-from-corner`}
      >
        {/* Header — content fades in as light spreads */}
        <header
          className={`flex items-center justify-between px-6 py-4 shrink-0 border-b animate-fade-in ${
            isDark ? 'border-white/10' : 'border-slate-200'
          }`}
          style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
        >
          <div className="flex items-center gap-3">
            <Clock className={`h-5 w-5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Today&apos;s Summary
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-white/50 hover:text-white hover:bg-white/10'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content — fades in as panel spreads */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4 animate-fade-in"
          style={{ animationDelay: '0.25s', animationFillMode: 'both' }}
        >
          {/* Total */}
          <div
            className={`mb-6 rounded-2xl p-4 ${
              isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-200'
            }`}
          >
            <div className={`text-sm ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
              Total today
            </div>
            <div
              className={`text-2xl font-semibold tabular-nums ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
              {formatDuration(totalSec)}
            </div>
          </div>

          {/* Entries list */}
          <div
            className={`text-sm font-medium mb-3 ${isDark ? 'text-white/70' : 'text-slate-700'}`}
          >
            Entries ({completedSessions.length + (isRunning ? 1 : 0)})
          </div>
          <div className="space-y-2">
            {completedSessions.map((s) => {
              const project = s.project_id ? projectMap.get(s.project_id) : null
              const isManual = !s.project_id && s.notes
              const isJira = isJiraTask(s.notes)
              const displayLabel = formatNotesForDisplay(s.notes) || project?.name || 'No project'
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 ${
                    isDark
                      ? 'bg-white/5 border border-white/10'
                      : 'bg-white border border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: project?.color
                          ? `${project.color}30`
                          : isDark
                            ? 'rgba(99,102,241,0.2)'
                            : 'rgba(99,102,241,0.15)',
                      }}
                    >
                      {isJira ? (
                        <Ticket
                          className={`h-4 w-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}
                        />
                      ) : isManual ? (
                        <Edit3
                          className={`h-4 w-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}
                        />
                      ) : (
                        <Folder
                          className={`h-4 w-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}
                      >
                        {displayLabel}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`tabular-nums font-medium shrink-0 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}
                  >
                    {formatDuration(s.duration_sec)}
                  </div>
                </div>
              )
            })}
            {isRunning && (
              <div
                className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 ${
                  isDark
                    ? 'bg-indigo-500/10 border border-indigo-500/20'
                    : 'bg-indigo-50 border border-indigo-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: currentSession?.projectId
                        ? `${projectMap.get(currentSession.projectId)?.color ?? '#6366f1'}30`
                        : 'rgba(99,102,241,0.2)',
                    }}
                  >
                    {isJiraTask(currentSession?.notes) ? (
                      <Ticket className="h-4 w-4 text-indigo-400 animate-pulse" />
                    ) : currentSession?.notes && !currentSession?.projectId ? (
                      <Edit3 className="h-4 w-4 text-indigo-400 animate-pulse" />
                    ) : (
                      <Clock className="h-4 w-4 text-indigo-400 animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {formatNotesForDisplay(currentSession?.notes) ||
                        (currentSession?.projectId
                          ? (projectMap.get(currentSession.projectId)?.name ?? 'In progress...')
                          : 'In progress...')}
                    </div>
                  </div>
                </div>
                <div className="tabular-nums font-medium text-indigo-400">
                  {formatDuration(elapsedSeconds)}
                </div>
              </div>
            )}
            {completedSessions.length === 0 && !isRunning && (
              <div
                className={`rounded-xl px-4 py-8 text-center ${
                  isDark ? 'text-white/50' : 'text-slate-500'
                }`}
              >
                No entries yet today
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
