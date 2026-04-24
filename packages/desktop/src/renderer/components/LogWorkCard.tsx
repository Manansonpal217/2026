import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle, AlertCircle, X, Search } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { TaskWithProject, JiraIssue } from './TaskSearchInput'
import { InlineLoader } from './Loader'

export interface StoppedSessionMeta {
  taskName: string
  issueKey: string | null
  platform: 'jira' | 'asana' | null
  /** Org work_platform (e.g. jira_cloud, asana) — used to scope inline search */
  workPlatform: string
  durationSec: number
  durationFormatted: string
}

interface LogWorkCardProps {
  stoppedSession: StoppedSessionMeta
  onDismiss: () => void
}

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

interface SearchPack {
  tasks: TaskWithProject[]
  syncedJiraIssues: JiraIssue[]
}

export function LogWorkCard({ stoppedSession, onDismiss }: LogWorkCardProps) {
  const { theme } = useTheme()
  const [comment, setComment] = useState(stoppedSession.taskName)
  const [isLogging, setIsLogging] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(stoppedSession.issueKey)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(() => {
    if (stoppedSession.issueKey) {
      return stoppedSession.platform === 'jira'
        ? stoppedSession.issueKey
        : stoppedSession.taskName !== 'Session'
          ? stoppedSession.taskName
          : stoppedSession.issueKey
    }
    return null
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [jiraResults, setJiraResults] = useState<JiraIssue[]>([])
  const [taskResults, setTaskResults] = useState<TaskWithProject[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setComment(stoppedSession.taskName)
    setSelectedIssueKey(stoppedSession.issueKey)
    setSelectedLabel(
      stoppedSession.issueKey
        ? stoppedSession.platform === 'jira'
          ? stoppedSession.issueKey
          : stoppedSession.taskName !== 'Session'
            ? stoppedSession.taskName
            : stoppedSession.issueKey
        : null
    )
    setSearchQuery('')
    setJiraResults([])
    setTaskResults([])
    setLogError(null)
    setLogSuccess(false)
  }, [
    stoppedSession.issueKey,
    stoppedSession.durationSec,
    stoppedSession.durationFormatted,
    stoppedSession.taskName,
    stoppedSession.platform,
    stoppedSession.workPlatform,
  ])

  const runSearch = useCallback(
    async (query: string) => {
      if (query.length < MIN_QUERY_LENGTH) {
        setJiraResults([])
        setTaskResults([])
        return
      }
      setSearchLoading(true)
      try {
        const pack = (await window.electron?.ipcRenderer.invoke(
          'projects:search-tasks',
          query,
          'me'
        )) as SearchPack | TaskWithProject[] | undefined
        let tasks: TaskWithProject[] = []
        let issues: JiraIssue[] = []
        if (Array.isArray(pack)) {
          tasks = pack
        } else if (pack && typeof pack === 'object') {
          tasks = pack.tasks ?? []
          issues = pack.syncedJiraIssues ?? []
        }
        if (stoppedSession.platform === 'jira') {
          setJiraResults(issues)
          setTaskResults([])
        } else if (stoppedSession.platform === 'asana') {
          setJiraResults([])
          setTaskResults(tasks.filter((t) => !!t.external_id))
        } else {
          setJiraResults([])
          setTaskResults([])
        }
      } catch {
        setJiraResults([])
        setTaskResults([])
      } finally {
        setSearchLoading(false)
      }
    },
    [stoppedSession.platform]
  )

  useEffect(() => {
    if (!stoppedSession.platform || stoppedSession.issueKey) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.length < MIN_QUERY_LENGTH) {
      setJiraResults([])
      setTaskResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(searchQuery)
      debounceRef.current = null
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, stoppedSession.platform, stoppedSession.issueKey, runSearch])

  const platformLabel =
    stoppedSession.platform === 'jira'
      ? 'Jira'
      : stoppedSession.platform === 'asana'
        ? 'Asana'
        : null

  const needsTaskPick = !!stoppedSession.platform && !stoppedSession.issueKey
  const canLog = !!selectedIssueKey && !!stoppedSession.platform

  const handleLog = async () => {
    if (!canLog) return

    setIsLogging(true)
    setLogError(null)
    try {
      if (stoppedSession.platform === 'jira') {
        const billableSec = Math.max(60, stoppedSession.durationSec)
        await window.trackysnc?.logWork(selectedIssueKey, billableSec, comment)
      } else {
        await window.electron?.ipcRenderer.invoke('asana:log-work', {
          taskId: selectedIssueKey,
          durationSec: stoppedSession.durationSec,
          comment,
        })
      }
      setLogSuccess(true)
      setTimeout(() => onDismiss(), 1500)
    } catch (err) {
      const raw = err instanceof Error ? err.message : `Failed to log to ${platformLabel}`
      setLogError(raw.replace(/^Error invoking remote method '[^']+': /, ''))
    } finally {
      setIsLogging(false)
    }
  }

  const pickJira = (issue: JiraIssue) => {
    setSelectedIssueKey(issue.key)
    setSelectedLabel(`${issue.key} — ${issue.summary}`)
    setSearchQuery('')
    setJiraResults([])
    setTaskResults([])
  }

  const pickAsanaTask = (task: TaskWithProject) => {
    if (!task.external_id) return
    setSelectedIssueKey(task.external_id)
    setSelectedLabel(task.name)
    setSearchQuery('')
    setJiraResults([])
    setTaskResults([])
  }

  const inputBase =
    theme === 'dark'
      ? 'bg-white/[0.04] text-white placeholder:text-white/40 border-white/[0.08]'
      : 'bg-slate-50 text-slate-800 placeholder:text-slate-400 border-slate-200'
  const rowBase =
    theme === 'dark'
      ? 'text-[#d1d5db] hover:bg-[rgba(255,255,255,0.04)]'
      : 'text-slate-700 hover:bg-slate-200'
  const muted = theme === 'dark' ? 'text-white/40' : 'text-slate-500'

  const hasSearchResults = jiraResults.length > 0 || taskResults.length > 0

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-hide animate-fade-in-up">
      <div
        className={`flex items-center justify-between shrink-0 mb-5 pb-3 border-b ${
          theme === 'dark' ? 'border-white/[0.06]' : 'border-slate-200'
        }`}
      >
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${
            theme === 'dark' ? 'text-white/50' : 'text-slate-500'
          }`}
        >
          Log work
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className={`p-1 rounded-lg transition-colors ${
            theme === 'dark'
              ? 'text-white/30 hover:text-white/60 hover:bg-white/[0.06]'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0 mb-4">
        {(selectedIssueKey || stoppedSession.issueKey) && (
          <span
            className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-md shrink-0 max-w-[min(100%,14rem)] truncate ${
              theme === 'dark'
                ? 'bg-white/[0.08] text-white/70 border border-white/[0.1]'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
            title={selectedLabel ?? selectedIssueKey ?? stoppedSession.issueKey ?? undefined}
          >
            {selectedLabel ?? selectedIssueKey ?? stoppedSession.issueKey}
          </span>
        )}
        <p className={`text-xs truncate ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>
          {stoppedSession.platform ? `Tracked via ${platformLabel}` : 'Session ended'}
        </p>
      </div>

      {needsTaskPick && (
        <div className="shrink-0 mb-4 space-y-2">
          <p className={`text-[10px] uppercase tracking-widest ${muted}`}>
            Log this time to a {platformLabel}{' '}
            {stoppedSession.platform === 'jira' ? 'issue' : 'task'}
          </p>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${muted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${platformLabel}…`}
              disabled={isLogging || logSuccess}
              className={[
                'w-full h-9 pl-9 pr-3 rounded-xl text-sm outline-none border transition-colors',
                inputBase,
              ].join(' ')}
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <InlineLoader size="sm" />
              </div>
            )}
          </div>
          {searchQuery.length > 0 && searchQuery.length < MIN_QUERY_LENGTH && (
            <p className={`text-[10px] ${muted}`}>Type at least {MIN_QUERY_LENGTH} characters</p>
          )}
          {hasSearchResults && !searchLoading && (
            <div
              className={[
                'max-h-[160px] overflow-y-auto rounded-xl border',
                theme === 'dark' ? 'border-white/[0.08] bg-[#0d1117]' : 'border-slate-200 bg-white',
              ].join(' ')}
            >
              {jiraResults.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => pickJira(issue)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b last:border-b-0',
                    theme === 'dark' ? 'border-white/[0.06]' : 'border-slate-100',
                    rowBase,
                  ].join(' ')}
                >
                  <span className={`text-xs shrink-0 ${muted}`}>{issue.key}</span>
                  <span className="truncate">{issue.summary}</span>
                </button>
              ))}
              {taskResults.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => pickAsanaTask(task)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b last:border-b-0',
                    theme === 'dark' ? 'border-white/[0.06]' : 'border-slate-100',
                    rowBase,
                  ].join(' ')}
                >
                  {task.external_id && (
                    <span className={`text-xs shrink-0 font-mono ${muted}`}>
                      {task.external_id}
                    </span>
                  )}
                  <span className="truncate">{task.name}</span>
                  <span className={`text-xs shrink-0 ${muted}`}>({task.project.name})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center justify-center shrink-0 py-6">
        <p
          className={`text-[10px] uppercase tracking-widest mb-1 ${
            theme === 'dark' ? 'text-white/40' : 'text-slate-500'
          }`}
        >
          Logged
        </p>
        <p
          className={`text-4xl md:text-5xl font-bold tabular-nums tracking-tighter text-center ${
            theme === 'dark' ? 'text-white/90' : 'text-slate-800'
          }`}
        >
          {stoppedSession.durationFormatted}
        </p>
      </div>

      <div className="shrink-0 mb-3">
        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What did you work on?"
          disabled={isLogging || logSuccess}
          className={[
            'w-full resize-none rounded-xl px-3 py-2.5 text-sm transition-colors outline-none border',
            theme === 'dark'
              ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/30 focus:border-white/[0.2] focus:bg-white/[0.06]'
              : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-slate-300 focus:bg-white',
            'disabled:opacity-60',
          ].join(' ')}
        />
      </div>

      {logError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 mb-3 shrink-0 animate-fade-in-up">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{logError}</p>
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">
        {logSuccess ? (
          <div className="flex items-center gap-2 flex-1 justify-center py-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span
              className={`text-sm font-medium ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              Logged to {platformLabel ?? stoppedSession.platform}
            </span>
          </div>
        ) : (
          <>
            {stoppedSession.platform && (
              <button
                type="button"
                onClick={handleLog}
                disabled={isLogging || !canLog}
                title={!canLog ? 'Select a task or issue above to log work' : undefined}
                className={[
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
                  'text-sm font-semibold transition-all duration-200 active:scale-[0.98]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  theme === 'dark'
                    ? 'bg-white/[0.08] text-white hover:bg-white/[0.14] border border-white/[0.1] hover:border-white/[0.18]'
                    : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-800',
                ].join(' ')}
              >
                {isLogging
                  ? 'Logging…'
                  : canLog
                    ? `Log to ${platformLabel}`
                    : needsTaskPick
                      ? 'Pick a task first'
                      : `Log to ${platformLabel}`}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              disabled={isLogging}
              className={[
                'px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                !stoppedSession.platform ? 'flex-1' : '',
                'disabled:opacity-50',
                theme === 'dark'
                  ? 'text-white/40 hover:text-white/70'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}
