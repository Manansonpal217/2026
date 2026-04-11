import { useEffect, useState, useCallback } from 'react'
import { Play, Square, AlertCircle, Activity, Folder, Edit3, Ticket } from 'lucide-react'
import { useTimerStore } from '../stores/timerStore'
import { useTheme } from '../contexts/ThemeContext'
import {
  TaskSearchInput,
  type TaskWithProject,
  type JiraIssue,
} from '../components/TaskSearchInput'
import type { Project } from '../components/ProjectPicker'
import type { LocalSessionRow } from '../stores/timerStore'
import { PageLoader, InlineLoader } from '../components/Loader'
import { formatNotesForDisplay, isJiraTask } from '../lib/format'
import { LogWorkCard, type StoppedSessionMeta } from '../components/LogWorkCard'

interface TimerProps {
  jiraConnected?: boolean
  jiraIssues?: JiraIssue[]
  onJiraConnected?: () => void
  onJiraDisconnected?: () => void
  refreshJiraIssues?: () => void | Promise<void>
}

export function Timer({ jiraConnected = false, jiraIssues = [] }: TimerProps = {}) {
  const { theme } = useTheme()
  const {
    isRunning,
    elapsedSeconds,
    todaySessions,
    currentSession,
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
  const [inputValue, setInputValue] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null)
  const [activityScore, setActivityScore] = useState<number | null>(null)
  const [inputMonitorAvailable, setInputMonitorAvailable] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [recentSessions, setRecentSessions] = useState<LocalSessionRow[]>([])
  const [selectedJiraIssue, setSelectedJiraIssue] = useState<JiraIssue | null>(null)
  const [showLogWorkCard, setShowLogWorkCard] = useState(false)
  const [stoppedSessionMeta, setStoppedSessionMeta] = useState<StoppedSessionMeta | null>(null)

  const fetchRecentSessions = useCallback(async () => {
    const sessions = (await window.electron?.ipcRenderer.invoke(
      'sessions:list-recent'
    )) as LocalSessionRow[]
    setRecentSessions(sessions ?? [])
  }, [])

  useEffect(() => {
    window.electron?.ipcRenderer.invoke('projects:list').then((list) => {
      setProjects((list as Project[]) ?? [])
    })
  }, [])

  useEffect(() => {
    fetchRecentSessions()
  }, [fetchRecentSessions])

  useEffect(() => {
    initialize()
      .then(() => {
        const session = useTimerStore.getState().currentSession
        if (session) {
          if (session.notes && !session.projectId) {
            setInputValue(session.notes)
            setSelectedProjectId(null)
            setSelectedTaskId(null)
            setSelectedTask(null)
          } else {
            setInputValue('')
            setSelectedProjectId(session.projectId ?? null)
            setSelectedTaskId(session.taskId ?? null)
            setSelectedTask(null)
          }
        }
        // Fetch activity on load so we show today's activity even when timer is stopped
        window.electron?.ipcRenderer.invoke('activity:current-stats').then((res) => {
          const r = res as { score?: number | null; inputAvailable?: boolean } | undefined
          if (r && 'score' in r) setActivityScore(r.score ?? null)
          if (r?.inputAvailable !== undefined) setInputMonitorAvailable(r.inputAvailable)
        })
      })
      .finally(() => setIsInitializing(false))
  }, [initialize])

  useEffect(() => {
    const handleTick = (...args: unknown[]) => setElapsed(args[0] as number)
    const handleStopped = async () => {
      // Capture before initialize() clears the store
      const storeSnapshot = useTimerStore.getState()
      const sessionAtStop = storeSnapshot.currentSession
      const elapsedAtStop = storeSnapshot.elapsedSeconds

      // Sync state only — do NOT call stop() or we'd invoke timer:stop and kill auto-restart poll
      initialize().catch(() => {})
      refreshTodaySessions().catch(() => {})
      fetchRecentSessions().catch(() => {})
      const res = (await window.electron?.ipcRenderer.invoke('activity:current-stats')) as
        | { score?: number | null }
        | undefined
      if (res && 'score' in res) setActivityScore(res.score ?? null)

      // Show log work card
      if (sessionAtStop) {
        const notes = sessionAtStop.notes
        let platform: 'jira' | 'asana' | null = null
        let issueKey: string | null = null
        let taskName = 'Session'
        if (notes?.startsWith('jira:')) {
          platform = 'jira'
          issueKey = notes.slice(5).trim()
          taskName = issueKey
        } else if (notes?.startsWith('asana:')) {
          platform = 'asana'
          issueKey = notes.slice(6).trim()
          taskName = issueKey
        }
        const h = Math.floor(elapsedAtStop / 3600)
        const m = Math.floor((elapsedAtStop % 3600) / 60)
        const s = Math.floor(elapsedAtStop % 60)
        const durationFormatted = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
        setStoppedSessionMeta({
          taskName,
          issueKey,
          platform,
          durationSec: elapsedAtStop,
          durationFormatted,
        })
        setShowLogWorkCard(true)
      }
    }
    const handleStarted = async () => {
      initialize().catch(() => {})
      refreshTodaySessions().catch(() => {})
      fetchRecentSessions().catch(() => {})
      const res = (await window.electron?.ipcRenderer.invoke('activity:current-stats')) as
        | { score?: number | null; inputAvailable?: boolean }
        | undefined
      if (res && 'score' in res) setActivityScore(res.score ?? null)
      if (res?.inputAvailable !== undefined) setInputMonitorAvailable(res.inputAvailable)
    }
    window.electron?.ipcRenderer.on('timer:tick', handleTick)
    window.electron?.ipcRenderer.on('timer:stopped', handleStopped)
    window.electron?.ipcRenderer.on('timer:started', handleStarted)
    return () => {
      window.electron?.ipcRenderer.off('timer:tick', handleTick)
      window.electron?.ipcRenderer.off('timer:stopped', handleStopped)
      window.electron?.ipcRenderer.off('timer:started', handleStarted)
    }
  }, [setElapsed, initialize, refreshTodaySessions, fetchRecentSessions])

  // Poll activity score when timer is running; also poll when stopped so we show today's activity after restart
  useEffect(() => {
    const poll = async () => {
      const res = (await window.electron?.ipcRenderer.invoke('activity:current-stats')) as
        | {
            score?: number | null
            inputAvailable?: boolean
          }
        | undefined
      if (res && 'score' in res) setActivityScore(res.score ?? null)
      if (res?.inputAvailable !== undefined) setInputMonitorAvailable(res.inputAvailable)
    }
    poll()
    const id = setInterval(poll, isRunning ? 10_000 : 30_000)
    return () => clearInterval(id)
  }, [isRunning])

  const handleToggle = useCallback(async () => {
    if (isRunning) {
      await stop()
    } else if (selectedJiraIssue) {
      await start({
        projectId: null,
        taskId: null,
        notes: `jira:${selectedJiraIssue.key}`,
      })
      await Promise.all([refreshTodaySessions(), fetchRecentSessions()])
    } else if (selectedProjectId && selectedTaskId) {
      await start({
        projectId: selectedProjectId,
        taskId: selectedTaskId,
        notes: null,
      })
      await Promise.all([refreshTodaySessions(), fetchRecentSessions()])
    } else {
      await start({
        projectId: null,
        taskId: null,
        notes: inputValue.trim() || null,
      })
      await Promise.all([refreshTodaySessions(), fetchRecentSessions()])
    }
  }, [
    isRunning,
    stop,
    start,
    selectedProjectId,
    selectedTaskId,
    selectedJiraIssue,
    inputValue,
    refreshTodaySessions,
    fetchRecentSessions,
  ])

  const handleSelect = useCallback(
    async (
      projectId: string | null,
      taskId: string | null,
      task?: TaskWithProject,
      manualNotes?: string
    ) => {
      setSelectedProjectId(projectId)
      setSelectedTaskId(taskId)
      setSelectedTask(task ?? null)
      setSelectedJiraIssue(null)
      if (manualNotes !== undefined) setInputValue(manualNotes)
      if (isRunning) {
        await switchTask({
          projectId,
          taskId,
          notes: projectId && taskId ? null : (manualNotes ?? inputValue).trim() || null,
        })
      }
    },
    [isRunning, switchTask, inputValue]
  )

  const handleJiraTaskSelect = useCallback(
    (issue: JiraIssue) => {
      setSelectedJiraIssue(issue)
      setSelectedProjectId(null)
      setSelectedTaskId(null)
      setSelectedTask(null)
      setInputValue('')
      if (isRunning) {
        switchTask({
          projectId: null,
          taskId: null,
          notes: `jira:${issue.key}`,
        })
      }
    },
    [isRunning, switchTask]
  )

  const handleSummaryClick = useCallback(
    async (session: LocalSessionRow) => {
      if (session.project_id && session.task_id) {
        try {
          const tasks = (await window.electron?.ipcRenderer.invoke(
            'projects:tasks',
            session.project_id,
            'all'
          )) as Array<{
            id: string
            name: string
            external_id?: string | null
            project_id?: string
          }>
          const task = tasks?.find((t) => t.id === session.task_id)
          const project = projects.find((p) => p.id === session.project_id)
          if (task && project) {
            const taskWithProject: TaskWithProject = {
              id: task.id,
              name: task.name,
              external_id: task.external_id,
              project_id: project.id,
              project: { id: project.id, name: project.name, color: project.color },
            }
            await handleSelect(project.id, task.id, taskWithProject)
          }
        } catch {
          // ignore
        }
      } else {
        await handleSelect(null, null, undefined, session.notes ?? '')
      }
    },
    [handleSelect, projects]
  )

  const todayTotalSec =
    todaySessions.filter((s) => s.ended_at).reduce((sum, s) => sum + s.duration_sec, 0) +
    (isRunning ? elapsedSeconds : 0)

  const formatDurationLong = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const formatDurationShort = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const todayCompleted = todaySessions.filter((s) => s.ended_at)

  // Merge sessions for the same task into one entry
  function mergeSessions(sessions: LocalSessionRow[]) {
    const groups = new Map<
      string,
      { sessions: LocalSessionRow[]; totalSec: number; firstStarted: string; lastEnded: string }
    >()
    for (const s of sessions) {
      const key =
        s.project_id != null && s.task_id != null
          ? `${s.project_id}|${s.task_id}`
          : `manual|${String(s.notes ?? '')}`
      const existing = groups.get(key)
      if (existing) {
        existing.sessions.push(s)
        existing.totalSec += s.duration_sec
        if (s.started_at < existing.firstStarted) existing.firstStarted = s.started_at
        if (s.ended_at && s.ended_at > existing.lastEnded) existing.lastEnded = s.ended_at
      } else {
        groups.set(key, {
          sessions: [s],
          totalSec: s.duration_sec,
          firstStarted: s.started_at,
          lastEnded: s.ended_at ?? s.started_at,
        })
      }
    }
    return Array.from(groups.entries()).map(([key, g]) => ({
      key,
      ...g,
      firstSession: g.sessions[0],
    }))
  }

  // Last 10 unique entries regardless of day: combine today + recent, dedupe by id, merge by task, sort by most recent
  const allCompletedRaw = [...todayCompleted, ...recentSessions]
  const seenIds = new Set<string>()
  const allCompleted = allCompletedRaw.filter((s) => {
    if (seenIds.has(s.id)) return false
    seenIds.add(s.id)
    return true
  })
  const mergedAll = mergeSessions(allCompleted)
    .sort((a, b) => new Date(b.lastEnded).getTime() - new Date(a.lastEnded).getTime())
    .slice(0, 10)

  // Running session key to merge with completed (from today or recent)
  const runningKey =
    isRunning && currentSession
      ? currentSession.projectId != null && currentSession.taskId != null
        ? `${currentSession.projectId}|${currentSession.taskId}`
        : `manual|${String(currentSession.notes ?? '')}`
      : null

  const matchedAll = runningKey ? mergedAll.find((m) => m.key === runningKey) : null
  const restWithoutRunning = matchedAll ? mergedAll.filter((m) => m.key !== runningKey) : mergedAll

  if (isInitializing) {
    return <PageLoader />
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {/* Subtle gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-1/3 -left-1/4 w-2/3 h-2/3 opacity-12 blur-[100px] animate-orb-float"
          style={{ background: 'radial-gradient(circle, #4338ca 0%, transparent 60%)' }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 w-1/2 h-1/2 opacity-10 blur-[80px] animate-float-subtle"
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
        <div
          className="flex flex-col flex-[6] min-w-0 min-h-0 animate-fade-in-up"
          style={{ animationDelay: '0ms' }}
        >
          <section
            className={`flex flex-col flex-1 min-h-0 rounded-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-out ${
              theme === 'dark'
                ? 'border border-white/[0.06] bg-[#0a0d12]/95 hover:border-white/[0.1]'
                : 'border border-slate-200/60 bg-white/90 hover:border-slate-200 hover:shadow-lg'
            }`}
            style={
              theme === 'dark'
                ? {
                    boxShadow:
                      '0 8px 16px -4px rgba(0,0,0,0.5), 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
                  }
                : { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
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
              <div className="flex flex-col flex-1 min-h-0 gap-4">
                <TaskSearchInput
                  value={inputValue}
                  onChange={setInputValue}
                  selectedProjectId={selectedProjectId}
                  selectedTaskId={selectedTaskId}
                  selectedTask={selectedTask}
                  selectedJiraIssue={selectedJiraIssue}
                  jiraIssues={jiraConnected ? jiraIssues : []}
                  onSelect={handleSelect}
                  onSelectJiraIssue={handleJiraTaskSelect}
                  disabled={false}
                  theme={theme}
                />
                {/* Summary below input */}
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  <p
                    className={`text-[10px] font-medium uppercase tracking-widest mb-2 shrink-0 ${
                      theme === 'dark' ? 'text-white/40' : 'text-slate-500'
                    }`}
                  >
                    Recent
                  </p>
                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1.5">
                    {mergedAll.length === 0 && !isRunning ? (
                      <p
                        className={`text-xs py-4 ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}
                      >
                        No sessions yet
                      </p>
                    ) : (
                      <>
                        {(isRunning && currentSession) || matchedAll
                          ? (() => {
                              const isCombined = matchedAll != null
                              const cs = currentSession
                              const m = matchedAll
                              const project = cs?.projectId
                                ? projectMap.get(cs.projectId)
                                : m
                                  ? projectMap.get(m.firstSession.project_id ?? '')
                                  : null
                              const isManual = cs
                                ? cs.projectId == null
                                : m
                                  ? m.firstSession.project_id == null
                                  : false
                              const notes = cs?.notes || m?.firstSession.notes
                              const isJira = isJiraTask(notes)
                              const displayLabel = isManual
                                ? formatNotesForDisplay(cs?.notes || m?.firstSession.notes) ||
                                  'Uncategorized'
                                : project?.name || 'No project'
                              const totalSec = isCombined
                                ? m!.totalSec + elapsedSeconds
                                : elapsedSeconds
                              return (
                                <button
                                  type="button"
                                  key={isCombined ? `combined-${runningKey}` : 'running'}
                                  onClick={() => {
                                    if (cs) {
                                      if (cs.projectId && cs.taskId) {
                                        handleSummaryClick({
                                          id: cs.id,
                                          started_at: cs.startedAt,
                                          ended_at: null,
                                          duration_sec: elapsedSeconds,
                                          project_id: cs.projectId,
                                          task_id: cs.taskId,
                                          notes: cs.notes,
                                          synced: 0,
                                        })
                                      } else {
                                        handleSelect(null, null, undefined, cs.notes ?? '')
                                      }
                                    } else if (m) {
                                      handleSummaryClick(m.firstSession)
                                    }
                                  }}
                                  className={[
                                    'w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors border',
                                    isRunning
                                      ? theme === 'dark'
                                        ? 'bg-white/[0.08] border-white/[0.12] text-[#d1d5db]'
                                        : 'bg-slate-100 border-slate-200 text-slate-700'
                                      : theme === 'dark'
                                        ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] text-[#d1d5db]'
                                        : 'border-slate-200/60 bg-slate-50/50 hover:bg-slate-100 text-slate-700',
                                  ].join(' ')}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                      style={{
                                        backgroundColor: project?.color
                                          ? `${project.color}30`
                                          : theme === 'dark'
                                            ? 'rgba(255,255,255,0.08)'
                                            : 'rgba(148,163,184,0.2)',
                                      }}
                                    >
                                      {isJira ? (
                                        <Ticket
                                          className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`}
                                        />
                                      ) : isManual ? (
                                        <Edit3
                                          className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`}
                                        />
                                      ) : (
                                        <Folder
                                          className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`}
                                        />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div
                                        className={`text-sm font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}
                                      >
                                        {displayLabel}
                                      </div>
                                    </div>
                                  </div>
                                  <span
                                    className={`tabular-nums text-xs font-medium shrink-0 ${
                                      theme === 'dark' ? 'text-white/70' : 'text-slate-600'
                                    }`}
                                  >
                                    {formatDurationShort(totalSec)}
                                  </span>
                                </button>
                              )
                            })()
                          : null}
                        {restWithoutRunning.map((m) => {
                          const s = m.firstSession
                          const project = s.project_id ? projectMap.get(s.project_id) : null
                          const isManual = s.project_id == null
                          const isJira = isJiraTask(s.notes)
                          const displayLabel = isManual
                            ? formatNotesForDisplay(s.notes) || 'Uncategorized'
                            : project?.name || 'No project'
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => handleSummaryClick(s)}
                              className={[
                                'w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors border',
                                theme === 'dark'
                                  ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] text-[#d1d5db]'
                                  : 'border-slate-200/60 bg-slate-50/50 hover:bg-slate-100 text-slate-700',
                              ].join(' ')}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                  style={{
                                    backgroundColor: project?.color
                                      ? `${project.color}30`
                                      : theme === 'dark'
                                        ? 'rgba(255,255,255,0.08)'
                                        : 'rgba(148,163,184,0.2)',
                                  }}
                                >
                                  {isJira ? (
                                    <Ticket
                                      className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`}
                                    />
                                  ) : isManual ? (
                                    <Edit3
                                      className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`}
                                    />
                                  ) : (
                                    <Folder
                                      className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-white/60' : 'text-slate-500'}`}
                                    />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div
                                    className={`text-sm font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}
                                  >
                                    {displayLabel}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`tabular-nums text-xs font-medium shrink-0 ${
                                  theme === 'dark' ? 'text-white/70' : 'text-slate-600'
                                }`}
                              >
                                {formatDurationShort(m.totalSec)}
                              </span>
                            </button>
                          )
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right panel — Timer */}
        <div
          className="flex flex-col flex-[4] min-w-[260px] min-h-0 shrink-0 animate-scale-in"
          style={{ animationDelay: '80ms', animationFillMode: 'both' }}
        >
          <section
            className={`flex flex-col flex-1 min-h-0 rounded-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-out ${
              theme === 'dark'
                ? 'border border-white/[0.06] bg-[#0a0d12]/95 hover:border-white/[0.1]'
                : 'border border-slate-200/60 bg-white/90 hover:border-slate-200 hover:shadow-lg'
            }`}
            style={
              theme === 'dark'
                ? {
                    boxShadow:
                      '0 8px 16px -4px rgba(0,0,0,0.5), 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
                  }
                : { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
            }
          >
            <div className="flex flex-col h-full min-h-0 p-5">
              {showLogWorkCard && stoppedSessionMeta ? (
                <LogWorkCard
                  stoppedSession={stoppedSessionMeta}
                  onDismiss={() => {
                    setShowLogWorkCard(false)
                    setStoppedSessionMeta(null)
                  }}
                />
              ) : (
                <>
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
                          isRunning
                            ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)] animate-pulse'
                            : theme === 'dark'
                              ? 'bg-white/30'
                              : 'bg-slate-300'
                        }`}
                        style={isRunning ? { animationDuration: '2s' } : undefined}
                      />
                      <span
                        className={`text-xs font-medium ${theme === 'dark' ? (isRunning ? 'text-emerald-400/90' : 'text-white/70') : isRunning ? 'text-emerald-600' : 'text-slate-600'}`}
                      >
                        {isRunning ? 'Tracking' : 'Ready'}
                      </span>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-[10px] uppercase tracking-widest ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}
                      >
                        Today
                      </p>
                      <p
                        className={`text-lg font-semibold tabular-nums tracking-tight transition-all duration-300 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}
                      >
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
                    <p
                      className={`text-[10px] uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}
                    >
                      Session
                    </p>
                    <p
                      className={[
                        'text-4xl md:text-5xl font-bold tabular-nums tracking-tighter transition-all duration-300 text-center',
                        isRunning
                          ? 'text-emerald-300'
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
                        ? window.electron?.platform === 'win32'
                          ? 'Input monitoring could not start. Try restarting the app; on Windows, accessibility toggles are usually not required—check antivirus or run as administrator if this persists.'
                          : 'Enable Accessibility in System Settings → Privacy & Security to track keyboard and mouse activity'
                        : undefined
                    }
                  >
                    <Activity
                      className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}
                    />
                    <span
                      className={`text-sm font-medium tabular-nums ${theme === 'dark' ? 'text-white/80' : 'text-slate-700'}`}
                    >
                      Activity {activityScore === null ? '—' : `${activityScore}%`}
                    </span>
                    {!inputMonitorAvailable && isRunning && (
                      <span
                        className={`text-[10px] ${theme === 'dark' ? 'text-amber-400/80' : 'text-amber-600'}`}
                      >
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
                            ? 'bg-white/5 text-white hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10 hover:border-white/20'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-md border border-slate-200 hover:border-slate-300',
                    ].join(' ')}
                  >
                    {isLoading ? (
                      <>
                        <InlineLoader size="md" />
                        <span>{isRunning ? 'Stop timer' : 'Start timer'}</span>
                      </>
                    ) : isRunning ? (
                      <>
                        <Square
                          className="h-5 w-5 transition-transform duration-300 group-hover:scale-110"
                          fill="currentColor"
                        />
                        Stop timer
                      </>
                    ) : (
                      <>
                        <Play
                          className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5"
                          fill="currentColor"
                        />
                        Start timer
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
