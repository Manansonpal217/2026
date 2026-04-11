import { useState } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export interface StoppedSessionMeta {
  taskName: string
  issueKey: string | null
  platform: 'jira' | 'asana' | null
  durationSec: number
  durationFormatted: string
}

interface LogWorkCardProps {
  stoppedSession: StoppedSessionMeta
  onDismiss: () => void
}

export function LogWorkCard({ stoppedSession, onDismiss }: LogWorkCardProps) {
  const { theme } = useTheme()
  const [comment, setComment] = useState(stoppedSession.taskName)
  const [isLogging, setIsLogging] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const platformLabel = stoppedSession.platform === 'jira' ? 'Jira' : 'Asana'

  const handleLog = async () => {
    if (!stoppedSession.issueKey || !stoppedSession.platform) return

    setIsLogging(true)
    setLogError(null)
    try {
      if (stoppedSession.platform === 'jira') {
        // Jira rejects worklogs under 60s — round up to 60 silently
        const billableSec = Math.max(60, stoppedSession.durationSec)
        await window.trackysnc?.logWork(stoppedSession.issueKey, billableSec, comment)
      } else {
        await window.electron?.ipcRenderer.invoke('asana:log-work', {
          taskId: stoppedSession.issueKey,
          durationSec: stoppedSession.durationSec,
          comment,
        })
      }
      setLogSuccess(true)
      setTimeout(() => onDismiss(), 1500)
    } catch (err) {
      const raw = err instanceof Error ? err.message : `Failed to log to ${platformLabel}`
      // Strip verbose IPC prefix Electron wraps errors with
      setLogError(raw.replace(/^Error invoking remote method '[^']+': /, ''))
    } finally {
      setIsLogging(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-hide animate-fade-in-up">
      {/* Header: title + dismiss X */}
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

      {/* Task badge + subtitle */}
      <div className="flex items-center gap-2 shrink-0 mb-4">
        {stoppedSession.issueKey && (
          <span
            className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-md shrink-0 ${
              theme === 'dark'
                ? 'bg-white/[0.08] text-white/70 border border-white/[0.1]'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {stoppedSession.issueKey}
          </span>
        )}
        <p className={`text-xs truncate ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>
          {stoppedSession.platform ? `Tracked via ${platformLabel}` : 'Session ended'}
        </p>
      </div>

      {/* Duration — large, centered */}
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

      {/* Comment textarea */}
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

      {/* Inline error */}
      {logError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 mb-3 shrink-0 animate-fade-in-up">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{logError}</p>
        </div>
      )}

      {/* Buttons / success state */}
      <div className="flex items-center gap-2 shrink-0">
        {logSuccess ? (
          <div className="flex items-center gap-2 flex-1 justify-center py-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span
              className={`text-sm font-medium ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              Logged to {platformLabel}
            </span>
          </div>
        ) : (
          <>
            {stoppedSession.platform && (
              <button
                type="button"
                onClick={handleLog}
                disabled={isLogging}
                className={[
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
                  'text-sm font-semibold transition-all duration-200 active:scale-[0.98]',
                  'disabled:opacity-60 disabled:cursor-wait',
                  theme === 'dark'
                    ? 'bg-white/[0.08] text-white hover:bg-white/[0.14] border border-white/[0.1] hover:border-white/[0.18]'
                    : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-800',
                ].join(' ')}
              >
                {isLogging ? 'Logging…' : `Log to ${platformLabel}`}
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
