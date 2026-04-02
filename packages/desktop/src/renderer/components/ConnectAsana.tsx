import { useState, useEffect, useCallback } from 'react'
import { Check, Link2, Unlink } from 'lucide-react'
import { InlineLoader } from './Loader'

type ConnectState = 'disconnected' | 'loading' | 'connected'

interface ConnectAsanaProps {
  onConnected?: () => void
  onDisconnected?: () => void
  theme?: 'light' | 'dark'
  compact?: boolean
}

export function ConnectAsana({
  onConnected,
  onDisconnected,
  theme = 'dark',
  compact,
}: ConnectAsanaProps) {
  const [state, setState] = useState<ConnectState>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const checkConnected = useCallback(async () => {
    const connected = await window.trackysnc?.isAsanaConnected?.()
    return connected === true
  }, [])

  useEffect(() => {
    checkConnected().then((connected) => {
      setState(connected ? 'connected' : 'disconnected')
      setError(null)
    })
  }, [checkConnected])

  useEffect(() => {
    const onLost = () => setState('disconnected')
    window.electron?.ipcRenderer?.on('asana:auth-lost', onLost)
    return () => window.electron?.ipcRenderer?.off('asana:auth-lost', onLost)
  }, [])

  const handleConnect = async () => {
    if (!window.trackysnc?.connectAsana) return
    setState('loading')
    setError(null)
    try {
      const result = await window.trackysnc.connectAsana()
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
    if (!window.trackysnc?.disconnectAsana) return
    try {
      await window.trackysnc.disconnectAsana()
      setState('disconnected')
      setError(null)
      onDisconnected?.()
    } catch {
      setError('Failed to disconnect')
    }
  }

  const base =
    theme === 'dark'
      ? 'bg-white/[0.04] border-white/[0.06] text-white'
      : 'bg-slate-100 border-slate-200 text-slate-800'
  const link =
    theme === 'dark' ? 'text-amber-400 hover:text-amber-300' : 'text-amber-700 hover:text-amber-800'

  if (state === 'connected') {
    if (compact) {
      return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${base}`}>
          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-medium">Asana</span>
          <button
            type="button"
            onClick={handleDisconnect}
            title="Disconnect Asana"
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
          <p className="text-sm font-medium truncate">Connected to Asana</p>
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
        <p className="text-sm">Connecting to Asana...</p>
      </div>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleConnect}
        disabled={!window.trackysnc?.connectAsana}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[11px] ${
          theme === 'dark'
            ? 'bg-amber-500/15 border-amber-500/25 text-amber-200 hover:bg-amber-500/25'
            : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Link2 className="h-3 w-3 shrink-0" />
        Connect Asana
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleConnect}
        disabled={!window.trackysnc?.connectAsana}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
          theme === 'dark'
            ? 'bg-amber-500/15 border-amber-500/25 text-amber-200 hover:bg-amber-500/25'
            : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Link2 className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">Connect Asana</span>
      </button>
      {error && (
        <p className={`text-xs ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>{error}</p>
      )}
    </div>
  )
}
