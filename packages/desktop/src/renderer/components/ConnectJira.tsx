import { useState, useEffect, useCallback } from 'react'
import { Check, Link2, Unlink, RefreshCw } from 'lucide-react'
import { InlineLoader } from './Loader'

type ConnectState = 'disconnected' | 'loading' | 'connected'

interface ConnectJiraProps {
  onConnected?: () => void
  onDisconnected?: () => void
  onRefresh?: () => void | Promise<void>
  theme?: 'light' | 'dark'
  /** Compact inline style for header placement */
  compact?: boolean
}

export function ConnectJira({
  onConnected,
  onDisconnected,
  onRefresh,
  theme = 'dark',
  compact,
}: ConnectJiraProps) {
  const [state, setState] = useState<ConnectState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const checkConnected = useCallback(async () => {
    const connected = await window.trackysnc?.isConnected()
    return connected === true
  }, [])

  useEffect(() => {
    checkConnected().then((connected) => {
      setState(connected ? 'connected' : 'disconnected')
      setError(null)
    })
  }, [checkConnected])

  const handleConnect = async () => {
    if (!window.trackysnc) return
    setState('loading')
    setError(null)
    try {
      const result = await window.trackysnc.connectJira()
      if (result?.success) {
        setState('connected')
        onConnected?.()
      } else {
        setState('disconnected')
        setError(result?.error ?? 'Connection failed')
      }
    } catch (err) {
      setState('disconnected')
      setError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const handleDisconnect = async () => {
    if (!window.trackysnc) return
    try {
      await window.trackysnc.disconnectJira()
      setState('disconnected')
      setError(null)
      onDisconnected?.()
    } catch {
      setError('Failed to disconnect')
    }
  }

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const base =
    theme === 'dark'
      ? 'bg-white/[0.04] border-white/[0.06] text-white'
      : 'bg-slate-100 border-slate-200 text-slate-800'
  const link =
    theme === 'dark'
      ? 'text-indigo-400 hover:text-indigo-300'
      : 'text-indigo-600 hover:text-indigo-700'

  if (state === 'connected') {
    if (compact) {
      return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${base}`}>
          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-medium">Jira</span>
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh Jira issues"
              className={`p-0.5 rounded transition-colors disabled:opacity-50 ${
                theme === 'dark'
                  ? 'text-white/50 hover:text-white hover:bg-white/10'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleDisconnect}
            title="Disconnect Jira"
            className={`text-[11px] ${link} ml-0.5`}
          >
            <Unlink className="h-3 w-3 inline" />
          </button>
        </div>
      )
    }
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${base}`}>
        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/20 shrink-0">
          <Check className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">Connected to Jira</p>
            {onRefresh && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh Jira issues"
                className={`p-1 rounded-lg transition-colors disabled:opacity-50 ${
                  theme === 'dark'
                    ? 'text-white/50 hover:text-white hover:bg-white/10'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                }`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          <button type="button" onClick={handleDisconnect} className={`text-xs ${link} mt-0.5`}>
            <Unlink className="h-3 w-3 inline mr-1 align-middle" />
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  if (state === 'loading') {
    if (compact) {
      return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${base}`}>
          <InlineLoader size="sm" />
          <span className="text-[11px]">Connecting...</span>
        </div>
      )
    }
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${base}`}>
        <InlineLoader size="sm" />
        <p className="text-sm">Connecting to Jira...</p>
      </div>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleConnect}
        disabled={!window.trackysnc}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[11px] ${
          theme === 'dark'
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
            : 'bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Link2 className="h-3 w-3 shrink-0" />
        Connect Jira
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleConnect}
        disabled={!window.trackysnc}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
          theme === 'dark'
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-300 hover:bg-blue-500/30'
            : 'bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Link2 className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">Connect Jira</span>
      </button>
      {error && (
        <p className={`text-xs ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>{error}</p>
      )}
    </div>
  )
}
