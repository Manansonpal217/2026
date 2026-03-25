import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertCircle, Folder, ExternalLink } from 'lucide-react'
import { Skeleton } from './Loader'

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

interface TaskSelectorProps {
  onTaskSelected: (issue: JiraIssue) => void
  selectedIssueKey?: string | null
  theme?: 'light' | 'dark'
}

function IssueTypeIcon({ issueType }: { issueType: string }) {
  const icon = issueType.toLowerCase().includes('bug') ? '🐛' : '📋'
  return (
    <span className="text-sm shrink-0" title={issueType}>
      {icon}
    </span>
  )
}

export function TaskSelector({
  onTaskSelected,
  selectedIssueKey,
  theme = 'dark',
}: TaskSelectorProps) {
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchIssues = useCallback(async () => {
    if (!window.trackysnc) return
    setLoading(true)
    setError(null)
    try {
      const list = (await window.trackysnc.getIssues()) as JiraIssue[]
      setIssues(list ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues')
      setIssues([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIssues()
  }, [fetchIssues])

  const cardBase =
    theme === 'dark'
      ? 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.07]'
      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
  const cardSelected =
    theme === 'dark' ? 'bg-indigo-500/15 border-indigo-500/40' : 'bg-indigo-50 border-indigo-200'
  const textBase = theme === 'dark' ? 'text-[#d1d5db]' : 'text-slate-700'
  const muted = theme === 'dark' ? 'text-white/40' : 'text-slate-500'
  const badge = theme === 'dark' ? 'bg-white/10 text-white/80' : 'bg-slate-200 text-slate-700'

  if (loading && issues.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className={`text-[10px] font-medium uppercase tracking-widest ${muted}`}>
            Your Jira issues
          </p>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-red-400/20 bg-red-500/10 ${textBase}`}
        >
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm flex-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={fetchIssues}
          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl border ${cardBase} ${textBase} text-sm`}
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <p className={`text-[10px] font-medium uppercase tracking-widest ${muted}`}>
          Your Jira issues
        </p>
        <button
          type="button"
          onClick={fetchIssues}
          disabled={loading}
          className={`p-1.5 rounded-lg transition-colors ${muted} hover:opacity-80 disabled:opacity-50`}
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {issues.length === 0 ? (
          <p className={`text-sm py-4 ${muted}`}>No open issues assigned to you</p>
        ) : (
          issues.map((issue) => {
            const isSelected = selectedIssueKey === issue.key
            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => onTaskSelected(issue)}
                className={`w-full flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-colors ${isSelected ? cardSelected : cardBase}`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <IssueTypeIcon issueType={issue.issueType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-mono font-medium ${theme === 'dark' ? 'text-indigo-300' : 'text-indigo-600'}`}
                      >
                        {issue.key}
                      </span>
                      <span className={`text-sm font-medium truncate ${textBase}`}>
                        {issue.summary}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 mt-1 flex-wrap ${muted} text-xs`}>
                      <span className="flex items-center gap-1">
                        <Folder className="h-3 w-3" />
                        {issue.project}
                      </span>
                      {issue.priority && (
                        <>
                          <span>•</span>
                          <span>{issue.priority}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className={`px-1.5 py-0.5 rounded ${badge}`}>{issue.status}</span>
                    </div>
                  </div>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`p-1 rounded shrink-0 ${muted} hover:opacity-80`}
                    title="Open in Jira"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
