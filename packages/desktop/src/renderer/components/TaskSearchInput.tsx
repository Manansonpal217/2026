import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { InlineLoader } from './Loader'

export interface TaskWithProject {
  id: string
  name: string
  external_id?: string | null
  project_id: string
  project: { id: string; name: string; color: string }
}

export interface JiraIssue {
  id: string
  key: string
  summary: string
  status: string
  priority: string | null
  project: string
  issueType: string
  url: string
}

interface TaskSearchInputProps {
  value: string
  onChange: (value: string) => void
  selectedProjectId: string | null
  selectedTaskId: string | null
  selectedTask: TaskWithProject | null
  selectedJiraIssue?: JiraIssue | null
  jiraIssues?: JiraIssue[]
  onSelect: (projectId: string | null, taskId: string | null, task?: TaskWithProject) => void
  onSelectJiraIssue?: (issue: JiraIssue) => void
  disabled?: boolean
  theme?: 'light' | 'dark'
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

function filterJiraIssues(issues: JiraIssue[], query: string): JiraIssue[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return issues.filter(
    (i) =>
      i.key.toLowerCase().includes(q) ||
      i.summary.toLowerCase().includes(q) ||
      i.project.toLowerCase().includes(q)
  )
}

export function TaskSearchInput({
  value,
  onChange,
  selectedProjectId,
  selectedTaskId,
  selectedTask,
  selectedJiraIssue,
  jiraIssues = [],
  onSelect,
  onSelectJiraIssue,
  disabled,
  theme = 'dark',
}: TaskSearchInputProps) {
  const [backendResults, setBackendResults] = useState<TaskWithProject[]>([])
  const [syncedJiraResults, setSyncedJiraResults] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const jiraMatches = value.length >= MIN_QUERY_LENGTH ? filterJiraIssues(jiraIssues, value) : []

  const mergedJiraRows = useMemo(() => {
    const byKey = new Map<string, JiraIssue>()
    for (const j of syncedJiraResults) byKey.set(j.key, j)
    for (const j of jiraMatches) byKey.set(j.key, j)
    return Array.from(byKey.values())
  }, [syncedJiraResults, jiraMatches])

  const search = useCallback(async (query: string) => {
    if (query.length < MIN_QUERY_LENGTH) {
      setBackendResults([])
      setSyncedJiraResults([])
      setHasSearched(false)
      return
    }
    setLoading(true)
    setHasSearched(true)
    try {
      const pack = await window.electron?.ipcRenderer.invoke('projects:search-tasks', query, 'me')
      if (Array.isArray(pack)) {
        setBackendResults((pack as TaskWithProject[]) ?? [])
        setSyncedJiraResults([])
      } else if (pack && typeof pack === 'object') {
        const o = pack as { tasks?: TaskWithProject[]; syncedJiraIssues?: JiraIssue[] }
        setBackendResults(o.tasks ?? [])
        setSyncedJiraResults(o.syncedJiraIssues ?? [])
      } else {
        setBackendResults([])
        setSyncedJiraResults([])
      }
    } catch {
      setBackendResults([])
      setSyncedJiraResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length < MIN_QUERY_LENGTH) {
      setBackendResults([])
      setSyncedJiraResults([])
      setShowDropdown(false)
      setHasSearched(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      search(value)
      setShowDropdown(true)
      debounceRef.current = null
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectTask = (task: TaskWithProject) => {
    onSelect(task.project_id, task.id, task)
    onChange('')
    setBackendResults([])
    setSyncedJiraResults([])
    setShowDropdown(false)
    setHasSearched(false)
  }

  const handleSelectJira = (issue: JiraIssue) => {
    onSelectJiraIssue?.(issue)
    onChange('')
    setBackendResults([])
    setSyncedJiraResults([])
    setShowDropdown(false)
    setHasSearched(false)
  }

  const handleClear = () => {
    onSelect(null, null)
  }

  const hasResults = backendResults.length > 0 || mergedJiraRows.length > 0

  const inputBase =
    theme === 'dark'
      ? 'bg-white/[0.04] text-white placeholder:text-white/40 hover:bg-white/[0.07] focus:bg-white/[0.07] border border-transparent focus:border-white/20'
      : 'bg-slate-100 text-slate-800 placeholder:text-slate-500 hover:bg-slate-200 focus:bg-slate-200 border border-transparent focus:border-slate-300'
  const rowBase =
    theme === 'dark'
      ? 'text-[#d1d5db] hover:bg-[rgba(255,255,255,0.04)]'
      : 'text-slate-700 hover:bg-slate-200'
  const muted = theme === 'dark' ? 'text-white/40' : 'text-slate-500'

  // Selected state: show task + project with clear button (backend or Jira)
  if (selectedJiraIssue) {
    const selectedInputBase =
      theme === 'dark'
        ? 'bg-white/[0.04] border border-transparent'
        : 'bg-slate-100 border border-transparent'
    return (
      <div ref={containerRef} className="flex flex-col gap-2">
        <div
          className={[
            'flex items-center gap-2 h-10 px-4 rounded-2xl text-sm',
            selectedInputBase,
            theme === 'dark' ? 'text-white' : 'text-slate-800',
          ].join(' ')}
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-[#0052CC]" />
          <span className={`flex-1 truncate ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
            <span className={`${muted} mr-1.5`}>{selectedJiraIssue.key}</span>
            {selectedJiraIssue.summary}
            <span className={muted}> ({selectedJiraIssue.project})</span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className={`p-1 rounded-lg transition-colors disabled:opacity-50 ${
              theme === 'dark'
                ? 'text-[#6b7280] hover:text-white hover:bg-white/10'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (selectedTask && selectedProjectId && selectedTaskId) {
    const selectedInputBase =
      theme === 'dark'
        ? 'bg-white/[0.04] border border-transparent'
        : 'bg-slate-100 border border-transparent'
    return (
      <div ref={containerRef} className="flex flex-col gap-2">
        <div
          className={[
            'flex items-center gap-2 h-10 px-4 rounded-2xl text-sm',
            selectedInputBase,
            theme === 'dark' ? 'text-white' : 'text-slate-800',
          ].join(' ')}
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: selectedTask.project.color }}
          />
          <span className={`flex-1 truncate ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
            {selectedTask.external_id && (
              <span className={`${muted} mr-1.5`}>{selectedTask.external_id}</span>
            )}
            {selectedTask.name}
            <span className={muted}> ({selectedTask.project.name})</span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className={`p-1 rounded-lg transition-colors disabled:opacity-50 ${
              theme === 'dark'
                ? 'text-[#6b7280] hover:text-white hover:bg-white/10'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // Input + search state
  return (
    <div ref={containerRef} className="relative z-10 flex flex-col gap-2">
      <div className="relative">
        <Search
          className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="PROJ-123 or Working on integration xyz..."
          disabled={disabled}
          className={[
            'w-full h-10 pl-11 pr-4 rounded-2xl text-sm transition-all duration-300 ease-out outline-none',
            'placeholder:opacity-60',
            inputBase,
          ].join(' ')}
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <InlineLoader size="sm" />
          </div>
        )}
      </div>

      {/* Recommendations dropdown — backend tasks + Jira issues when typing */}
      {showDropdown && value.length >= MIN_QUERY_LENGTH && hasResults && !loading && (
        <div
          className={[
            'absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border overflow-hidden shadow-lg',
            theme === 'dark' ? 'bg-[#0d1117] border-white/[0.08]' : 'bg-white border-slate-200',
          ].join(' ')}
        >
          <div className="max-h-[200px] overflow-y-auto">
            {backendResults.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => handleSelectTask(task)}
                className={[
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors',
                  rowBase,
                ].join(' ')}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: task.project.color }}
                />
                {task.external_id && (
                  <span className={`text-xs ${muted} shrink-0`}>{task.external_id}</span>
                )}
                <span className="flex-1 truncate">{task.name}</span>
                <span className={`text-xs ${muted} shrink-0`}>({task.project.name})</span>
              </button>
            ))}
            {mergedJiraRows.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => handleSelectJira(issue)}
                className={[
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors',
                  rowBase,
                ].join(' ')}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-[#0052CC]" />
                <span className={`text-xs ${muted} shrink-0`}>{issue.key}</span>
                <span className="flex-1 truncate">{issue.summary}</span>
                <span className={`text-xs ${muted} shrink-0`}>({issue.project})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {value.length > 0 && !hasSearched && value.length < MIN_QUERY_LENGTH && (
        <p className={`text-[10px] ${muted}`}>Type at least 2 characters to search</p>
      )}
    </div>
  )
}
