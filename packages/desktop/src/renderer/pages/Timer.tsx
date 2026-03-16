import { useEffect, useState, useCallback } from 'react'
import { Play, Square, AlertCircle, Activity, Folder, Edit3 } from 'lucide-react'
import { useTimerStore } from '../stores/timerStore'
import { useTheme } from '../contexts/ThemeContext'
import { ProjectPicker } from '../components/ProjectPicker'
import { PageLoader, InlineLoader } from '../components/Loader'

const ENTRY_MODE_KEY = 'timer-entry-mode'

type EntryMode = 'project' | 'manual'

function getStoredEntryMode(): EntryMode {
  try {
    const stored = localStorage.getItem(ENTRY_MODE_KEY)
    if (stored === 'project' || stored === 'manual') return stored
  } catch {
    // ignore
  }
  return 'project'
}

export function Timer() {
  const { theme } = useTheme()
  const {
    isRunning,
    elapsedSeconds,
    todaySessions,
    isLoading,
    error,
    initialize,
    start,
    stop,
    switchTask,
    setElapsed,
    refreshTodaySessions,
  } = useTimerStore()

  const [isInitializing, setIsInitializing] = useState(true)
  const [entryMode, setEntryMode] = useState<EntryMode>(getStoredEntryMode)
  const [manualNotes, setManualNotes] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activityScore, setActivityScore] = useState(0)
  const [inputMonitorAvailable, setInputMonitorAvailable] = useState(true)

  useEffect(() => {
    initialize()
      .then(() => {
        const session = useTimerStore.getState().currentSession
        if (session) {
          if (session.notes && !session.projectId) {
            setEntryMode('manual')
            setManualNotes(session.notes)
            setSelectedProjectId(null)
            setSelectedTaskId(null)
          } else {
            setEntryMode('project')
            setSelectedProjectId(session.projectId)
            setSelectedTaskId(session.taskId)
            setManualNotes('')
          }
        }
      })
      .finally(() => setIsInitializing(false))
  }, [initialize])

  useEffect(() => {
    const handleTick = (...args: unknown[]) => setElapsed(args[0] as number)
    const handleStopped = () => {
      stop().catch(() => {})
      refreshTodaySessions().catch(() => {})
      setActivityScore(0)
    }
    window.electron?.ipcRenderer.on('timer:tick', handleTick)
    window.electron?.ipcRenderer.on('timer:stopped', handleStopped)
    return () => {
      window.electron?.ipcRenderer.off('timer:tick', handleTick)
      window.electron?.ipcRenderer.off('timer:stopped', handleStopped)
    }
  }, [setElapsed, stop, refreshTodaySessions])

  // Poll activity score when timer is running
  useEffect(() => {
    if (!isRunning) return
    const poll = async () => {
      const res = (await window.electron?.ipcRenderer.invoke('activity:current-stats')) as {
        score: number
        inputAvailable?: boolean
      } | undefined
      if (res?.score !== undefined) setActivityScore(res.score)
      if (res?.inputAvailable !== undefined) setInputMonitorAvailable(res.inputAvailable)
    }
    poll()
    const id = setInterval(poll, 2_000)
    return () => clearInterval(id)
  }, [isRunning])

  const handleModeChange = useCallback(
    async (mode: EntryMode) => {
      setEntryMode(mode)
      try {
        localStorage.setItem(ENTRY_MODE_KEY, mode)
      } catch {
        // ignore
      }
      if (mode === 'manual') {
        setSelectedProjectId(null)
        setSelectedTaskId(null)
        if (isRunning) {
          await switchTask({ projectId: null, taskId: null, notes: manualNotes.trim() || null })
        }
      } else {
        setManualNotes('')
        if (isRunning) {
          await switchTask({ projectId: selectedProjectId, taskId: selectedTaskId })
        }
      }
    },
    [isRunning, manualNotes, selectedProjectId, selectedTaskId, switchTask],
  )

  const handleToggle = useCallback(async () => {
    if (isRunning) {
      await stop()
    } else if (entryMode === 'manual') {
      await start({
        projectId: null,
        taskId: null,
        notes: manualNotes.trim() || null,
      })
    } else {
      await start({
        projectId: selectedProjectId,
        taskId: selectedTaskId,
        notes: null,
      })
    }
  }, [isRunning, stop, start, entryMode, manualNotes, selectedProjectId, selectedTaskId])

  const handleProjectChange = useCallback(
    async (projectId: string | null, taskId: string | null) => {
      setSelectedProjectId(projectId)
      setSelectedTaskId(taskId)
      if (isRunning) {
        await switchTask({ projectId, taskId })
      }
    },
    [isRunning, switchTask],
  )

  const handleManualNotesChange = useCallback((value: string) => {
    setManualNotes(value)
  }, [])

  const todayTotalSec =
    todaySessions
      .filter((s) => s.ended_at)
      .reduce((sum, s) => sum + s.duration_sec, 0) + (isRunning ? elapsedSeconds : 0)

  const formatDurationLong = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  if (isInitializing) {
    return <PageLoader />
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-1/3 -left-1/4 w-2/3 h-2/3 opacity-20 blur-[100px] animate-orb-float"
          style={{ background: 'radial-gradient(circle, #4338ca 0%, transparent 60%)' }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 w-1/2 h-1/2 opacity-15 blur-[80px] animate-float-subtle"
          style={{
            background: 'radial-gradient(circle, #7c3aed 0%, transparent 60%)',
            animationDelay: '2s',
          }}
        />
      </div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Main content — structured layout, aligned */}
      <div className="relative flex flex-1 gap-8 p-8 min-w-0 min-h-0 items-stretch overflow-hidden">
        {/* Left panel — Project & Task */}
        <div className="flex flex-col flex-[6] min-w-0 min-h-0 animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <section
            className={`flex flex-col flex-1 min-h-0 rounded-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-out ${
              theme === 'dark'
                ? 'border border-white/[0.18] bg-[#0a0d12]/90 hover:border-white/[0.22]'
                : 'border border-slate-200 bg-white/90 hover:border-slate-300 hover:shadow-lg'
            }`}
            style={
              theme === 'dark'
                ? {
                    boxShadow:
                      '0 8px 16px -4px rgba(0,0,0,0.5), 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }
                : { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }
            }
          >
            <div className="p-5 flex flex-col h-full min-h-0">
              <h2
                className={`text-xs font-semibold uppercase tracking-widest mb-4 shrink-0 ${
                  theme === 'dark' ? 'text-white/50' : 'text-slate-500'
                }`}
              >
                What are you working on?
              </h2>
              {/* Segmented control */}
              <div
                className={[
                  'flex shrink-0 rounded-2xl p-1 mb-4',
                  theme === 'dark' ? 'bg-white/[0.04]' : 'bg-slate-100',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => handleModeChange('project')}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-all duration-200',
                    entryMode === 'project'
                      ? theme === 'dark'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'bg-white text-slate-800 shadow-sm'
                      : theme === 'dark'
                        ? 'text-white/50 hover:text-white/70'
                        : 'text-slate-600 hover:text-slate-800',
                  ].join(' ')}
                >
                  <Folder className="h-3.5 w-3.5" />
                  Project & Task
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('manual')}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-all duration-200',
                    entryMode === 'manual'
                      ? theme === 'dark'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'bg-white text-slate-800 shadow-sm'
                      : theme === 'dark'
                        ? 'text-white/50 hover:text-white/70'
                        : 'text-slate-600 hover:text-slate-800',
                  ].join(' ')}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Manual entry
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {entryMode === 'project' ? (
                  <ProjectPicker
                    selectedProjectId={selectedProjectId}
                    selectedTaskId={selectedTaskId}
                    onProjectChange={handleProjectChange}
                    disabled={false}
                    expanded
                    theme={theme}
                  />
                ) : (
                  <div className="flex flex-col flex-1 min-h-0">
                    <label
                      className={`block text-[10px] font-medium uppercase tracking-widest mb-2 ${
                        theme === 'dark' ? 'text-white/40' : 'text-slate-500'
                      }`}
                    >
                      Description
                    </label>
                    <input
                      type="text"
                      value={manualNotes}
                      onChange={(e) => handleManualNotesChange(e.target.value.slice(0, 200))}
                      placeholder="e.g. Code review, Meeting prep, Research..."
                      maxLength={200}
                      className={[
                        'w-full h-10 px-4 rounded-2xl text-sm transition-all duration-300 ease-out',
                        'placeholder:opacity-60',
                        theme === 'dark'
                          ? 'bg-white/[0.04] text-white placeholder:text-white/40 hover:bg-white/[0.07] focus:bg-white/[0.07] border border-transparent focus:border-white/20'
                          : 'bg-slate-100 text-slate-800 placeholder:text-slate-500 hover:bg-slate-200 focus:bg-slate-200 border border-transparent focus:border-slate-300',
                      ].join(' ')}
                    />
                    <p
                      className={`mt-2 text-[10px] ${
                        theme === 'dark' ? 'text-white/30' : 'text-slate-400'
                      }`}
                    >
                      {manualNotes.length}/200
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right panel — Timer */}
        <div className="flex flex-col flex-[4] min-w-[260px] min-h-0 shrink-0 animate-scale-in" style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
          <section
            className={`flex flex-col flex-1 min-h-0 rounded-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-out ${
              theme === 'dark'
                ? 'border border-white/[0.18] bg-[#0a0d12]/90 hover:border-white/[0.22]'
                : 'border border-slate-200 bg-white/90 hover:border-slate-300 hover:shadow-lg'
            }`}
            style={
              theme === 'dark'
                ? {
                    boxShadow:
                      '0 8px 16px -4px rgba(0,0,0,0.5), 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }
                : { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }
            }
          >
            <div className="flex flex-col h-full min-h-0 p-5">
            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2.5 mb-4 animate-fade-in-up shrink-0">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            {/* Header row — Status + Today (aligned) */}
            <div
              className={`flex items-center justify-between shrink-0 mb-5 pb-3 border-b ${
                theme === 'dark' ? 'border-white/[0.06]' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                    isRunning ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)] animate-pulse' : theme === 'dark' ? 'bg-white/30' : 'bg-slate-300'
                  }`}
                  style={isRunning ? { animationDuration: '2s' } : undefined}
                />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white/70' : 'text-slate-600'}`}>
                  {isRunning ? 'Tracking' : 'Ready'}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-[10px] uppercase tracking-widest ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>Today</p>
                <p className={`text-lg font-semibold tabular-nums tracking-tight transition-all duration-300 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                  {formatDurationLong(todayTotalSec)}
                </p>
              </div>
            </div>

            {/* Session timer — centered */}
            <div
              className={`flex flex-col items-center justify-center flex-1 min-h-0 py-5 transition-all duration-500 ${
                isRunning ? 'animate-timer-glow' : ''
              }`}
            >
              <p className={`text-[10px] uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>Session</p>
              <p
                className={[
                  'text-4xl md:text-5xl font-bold tabular-nums tracking-tighter transition-all duration-300 text-center',
                  isRunning
                    ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-300'
                    : theme === 'dark'
                      ? 'text-white/90'
                      : 'text-slate-800',
                ].join(' ')}
              >
                {formatDurationLong(elapsedSeconds)}
              </p>
            </div>

            {/* Activity — centered */}
            <div
              className="flex items-center justify-center gap-2 shrink-0 mb-4"
              title={
                !inputMonitorAvailable && isRunning
                  ? 'Enable Accessibility in System Settings → Privacy & Security to track keyboard and mouse activity'
                  : undefined
              }
            >
              <Activity className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`} />
              <span className={`text-sm font-medium tabular-nums ${theme === 'dark' ? 'text-white/80' : 'text-slate-700'}`}>
                Activity {activityScore}%
              </span>
              {!inputMonitorAvailable && isRunning && (
                <span className={`text-[10px] ${theme === 'dark' ? 'text-amber-400/80' : 'text-amber-600'}`}>
                  (needs permission)
                </span>
              )}
            </div>

            {/* Start/Stop button */}
            <button
              type="button"
              onClick={handleToggle}
              disabled={isLoading}
              className={[
                'group w-full flex items-center justify-center gap-3 px-5 py-3 rounded-2xl shrink-0',
                'text-sm font-semibold transition-all duration-300 ease-out',
                'active:scale-[0.98] hover:scale-[1.02] disabled:hover:scale-100',
                isLoading
                  ? 'opacity-90 cursor-wait'
                  : isRunning
                    ? `bg-red-500/20 hover:bg-red-500/30 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)] ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`
                    : theme === 'dark'
                      ? 'bg-white/5 text-white hover:bg-white/10 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] border border-white/10 hover:border-indigo-400/30'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] border border-indigo-200 hover:border-indigo-300',
              ].join(' ')}
            >
              {isLoading ? (
                <>
                  <InlineLoader size="md" />
                  <span>{isRunning ? 'Stop timer' : 'Start timer'}</span>
                </>
              ) : isRunning ? (
                <>
                  <Square className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" fill="currentColor" />
                  Stop timer
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" fill="currentColor" />
                  Start timer
              </>
            )}
            </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
