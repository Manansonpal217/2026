import { useState, useEffect, useCallback } from 'react'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import { Timer } from './pages/Timer'
import { ConnectJira } from './components/ConnectJira'
import {
  Zap,
  ExternalLink,
  Users,
  Sun,
  Moon,
  Camera,
  Clock,
  BarChart3,
  Settings,
} from 'lucide-react'
import ReportsPage from './pages/Reports'
import ScreenshotsPage from './pages/Screenshots'
import AppSettingsPage from './pages/AppSettings'
import type { JiraIssue } from './components/TaskSearchInput'
import { SummaryPanel } from './components/SummaryPanel'
import { useTheme } from './contexts/ThemeContext'
import { useTimerStore } from './stores/timerStore'
import { gravatarUrl } from './lib/gravatar'

interface User {
  id: string
  name: string
  email: string
  role: string
  org_id?: string
  avatar_url?: string | null
}

function LoadingScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background animate-fade-in">
      <div
        className="absolute top-0 left-0 h-64 w-64 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }}
      />
      <div
        className="absolute bottom-0 right-0 h-48 w-48 rounded-full opacity-8 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }}
      />
      <div className="flex flex-col items-center gap-5 relative">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_20px_rgba(99,102,241,0.4)]">
          <Zap className="h-7 w-7 text-white" fill="white" />
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-white/30 animate-spin-slow" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">TrackSync</p>
          <p className="text-xs text-muted mt-0.5">Initializing...</p>
        </div>
      </div>
    </div>
  )
}

interface DashboardShellProps {
  user: User
  onSignOut: () => void
}

function AvatarBlock({
  src,
  initials,
  name,
  theme,
}: {
  src: string | null
  initials: string
  name: string
  theme: 'light' | 'dark'
}) {
  const [useFallback, setUseFallback] = useState(!src)
  const effectiveSrc = useFallback ? null : src
  return (
    <div
      className={`h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-semibold shrink-0 overflow-hidden ${
        !effectiveSrc
          ? theme === 'dark'
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'bg-indigo-100 text-indigo-600'
          : ''
      }`}
      title={name}
    >
      {effectiveSrc ? (
        <img
          src={effectiveSrc}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setUseFallback(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}

function formatLastCaptured(isoString: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

type ShellPage = 'timer' | 'reports' | 'screenshots' | 'settings'

function DashboardShell({ user, onSignOut }: DashboardShellProps) {
  const [, setSyncStatus] = useState<{
    pending: number
    pendingActivity?: number
    pendingScreenshots?: number
  } | null>(null)
  const [activePage, setActivePage] = useState<ShellPage>('timer')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [streak, setStreak] = useState<number>(0)
  const [lastScreenshotAt, setLastScreenshotAt] = useState<string | null>(null)
  const [notifyScreenshotCapture, setNotifyScreenshotCapture] = useState(false)
  const [jiraConnected, setJiraConnected] = useState(false)
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([])
  const { theme, toggleTheme } = useTheme()

  const refreshJiraIssues = useCallback(async () => {
    const list = (await window.trackysnc?.getIssues()) as JiraIssue[] | undefined
    setJiraIssues(list ?? [])
  }, [])

  useEffect(() => {
    window.trackysnc?.isConnected().then((connected) => setJiraConnected(connected === true))
  }, [])

  useEffect(() => {
    if (jiraConnected) {
      window.trackysnc?.getIssues().then((list) => setJiraIssues((list as JiraIssue[]) ?? []))
    } else {
      setJiraIssues([])
    }
  }, [jiraConnected])

  useEffect(() => {
    const onJiraAuthLost = () => setJiraConnected(false)
    window.electron?.ipcRenderer?.on('jira:auth-lost', onJiraAuthLost)
    return () => window.electron?.ipcRenderer?.off('jira:auth-lost', onJiraAuthLost)
  }, [])
  const { todaySessions, currentSession, isRunning, elapsedSeconds } = useTimerStore()

  const fetchLastScreenshot = () => {
    window.electron?.ipcRenderer
      .invoke('screenshots:last-captured')
      .then((t) => setLastScreenshotAt((t as string | null) ?? null))
  }

  useEffect(() => {
    window.electron?.ipcRenderer
      .invoke('prefs:get')
      .then((p) =>
        setNotifyScreenshotCapture(
          (p as { notifyOnScreenshotCapture?: boolean }).notifyOnScreenshotCapture === true
        )
      )
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchLastScreenshot()
    const onCaptured = (...args: unknown[]) => {
      const payload = args[0] as { taken_at: string }
      setLastScreenshotAt(payload.taken_at)
    }
    window.electron?.ipcRenderer?.on('screenshot:captured', onCaptured)
    const id = setInterval(fetchLastScreenshot, 30_000)
    return () => {
      window.electron?.ipcRenderer?.off('screenshot:captured', onCaptured)
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    window.electron?.ipcRenderer
      .invoke('sync:status')
      .then((s) =>
        setSyncStatus(
          s as { pending: number; pendingActivity?: number; pendingScreenshots?: number }
        )
      )
    const id = setInterval(
      () =>
        window.electron?.ipcRenderer
          .invoke('sync:status')
          .then((s) =>
            setSyncStatus(
              s as { pending: number; pendingActivity?: number; pendingScreenshots?: number }
            )
          ),
      10_000
    )
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const fetchStreak = () => {
      window.electron?.ipcRenderer.invoke('streak:get').then((s) => setStreak((s as number) ?? 0))
    }
    fetchStreak()
    const id = setInterval(fetchStreak, 5 * 60 * 1000)
    window.electron?.ipcRenderer?.on('timer:stopped', fetchStreak)
    return () => {
      clearInterval(id)
      window.electron?.ipcRenderer?.off('timer:stopped', fetchStreak)
    }
  }, [])

  const initials =
    (user.name
      ? user.name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : user.email
        ? user.email.charAt(0).toUpperCase()
        : user.id
          ? user.id.slice(0, 2).toUpperCase()
          : '?') || '?'
  const avatarSrc = user.avatar_url || (user.email ? gravatarUrl(user.email, 48) : null)

  return (
    <div
      className={`flex flex-col h-full w-full transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#050508]' : 'bg-slate-50'
      }`}
    >
      {/* Header — soft, minimal; gradient at top to soften title bar seam */}
      <header
        className={`flex items-center justify-between px-6 py-3 shrink-0 backdrop-blur-sm transition-colors duration-300 ${
          theme === 'dark' ? 'bg-[#050508]/80' : 'bg-white/80'
        }`}
        style={
          theme === 'dark'
            ? {
                background: 'linear-gradient(to bottom, rgba(5,5,8,0.4) 0%, rgba(5,5,8,0.85) 100%)',
              }
            : {
                background:
                  'linear-gradient(to bottom, rgba(248,250,252,0.5) 0%, rgba(255,255,255,0.95) 100%)',
              }
        }
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600/40 to-slate-500/30">
            <Clock
              className={`h-4.5 w-4.5 ${theme === 'dark' ? 'text-white/80' : 'text-slate-600'}`}
            />
          </div>
          <div className="flex flex-col">
            <span
              className={`text-sm font-semibold leading-tight ${theme === 'dark' ? 'text-white/90' : 'text-slate-800'}`}
            >
              TrackSync
            </span>
            <span
              className={`text-[11px] leading-tight ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}
            >
              v2.1.0
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg ${
              theme === 'dark' ? 'text-amber-400/90' : 'text-amber-600'
            }`}
            title="Streak: Consecutive days you've opened TrackSync and tracked time. If you tracked today, today counts; otherwise it counts backward from your last active day. A day counts when you have at least one completed time session."
          >
            <span>🔥</span>
            <span className="tabular-nums font-medium">{streak}</span>
          </span>
          <ConnectJira
            theme={theme}
            compact
            onConnected={() => setJiraConnected(true)}
            onDisconnected={() => setJiraConnected(false)}
            onRefresh={refreshJiraIssues}
          />
          <button
            type="button"
            onClick={() => setSummaryOpen((o) => !o)}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              theme === 'dark'
                ? 'text-white/50 hover:text-white/80 hover:bg-white/5'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
            } px-2.5 py-1.5 rounded-lg`}
          >
            <Users className="h-3.5 w-3.5" />
            Summary
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-2 rounded-xl transition-all duration-300 ${
              theme === 'dark'
                ? 'text-white/40 hover:text-white/70 hover:bg-white/5'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Primary navigation — Timer, Reports, Screenshots, Settings */}
      <nav
        className={`flex items-center gap-0.5 px-4 sm:px-6 py-1.5 shrink-0 border-b ${
          theme === 'dark'
            ? 'border-white/[0.06] bg-[#050508]/40'
            : 'border-slate-200/80 bg-white/50'
        }`}
        aria-label="Main"
      >
        {(
          [
            { id: 'timer' as const, label: 'Timer', Icon: Clock },
            { id: 'reports' as const, label: 'Reports', Icon: BarChart3 },
            { id: 'screenshots' as const, label: 'Screenshots', Icon: Camera },
            { id: 'settings' as const, label: 'Settings', Icon: Settings },
          ] as const
        ).map(({ id, label, Icon }) => {
          const on = activePage === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActivePage(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                on
                  ? theme === 'dark'
                    ? 'bg-white/[0.08] text-indigo-300'
                    : 'bg-indigo-50 text-indigo-700'
                  : theme === 'dark'
                    ? 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/80'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Summary panel overlay */}
      <SummaryPanel
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        sessions={todaySessions}
        currentSession={currentSession}
        isRunning={isRunning}
        elapsedSeconds={elapsedSeconds}
        theme={theme}
      />

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activePage === 'timer' ? (
          <Timer
            jiraConnected={jiraConnected}
            jiraIssues={jiraIssues}
            onJiraConnected={() => setJiraConnected(true)}
            onJiraDisconnected={() => setJiraConnected(false)}
            refreshJiraIssues={refreshJiraIssues}
          />
        ) : activePage === 'reports' ? (
          <ReportsPage />
        ) : activePage === 'screenshots' ? (
          <ScreenshotsPage />
        ) : (
          <AppSettingsPage />
        )}
      </div>

      {/* Footer — soft, minimal */}
      <footer
        className={`flex items-center justify-between px-6 py-3 shrink-0 backdrop-blur-sm transition-colors duration-300 ${
          theme === 'dark' ? 'bg-[#050508]/60' : 'bg-white/60'
        }`}
      >
        <div
          className={`flex items-center gap-6 text-[11px] ${theme === 'dark' ? 'text-white/70' : 'text-slate-600'}`}
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400/80 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
            <span>Online</span>
          </span>
          <span
            className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}
          >
            <Camera className="h-3 w-3" />
            <span className="tabular-nums">
              {lastScreenshotAt ? formatLastCaptured(lastScreenshotAt) : 'Never'}
            </span>
          </span>
          <label
            className={`flex items-center gap-2 cursor-pointer select-none ${
              theme === 'dark'
                ? 'text-white/45 hover:text-white/65'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Show a system notification each time a screenshot is saved while the timer runs"
          >
            <input
              type="checkbox"
              className="rounded border-white/20 bg-white/5 accent-indigo-500 h-3.5 w-3.5 shrink-0"
              checked={notifyScreenshotCapture}
              onChange={(e) => {
                const on = e.target.checked
                setNotifyScreenshotCapture(on)
                window.electron?.ipcRenderer.invoke('prefs:set-notify-screenshot-capture', on)
              }}
            />
            <span className="tabular-nums">Screenshot alerts</span>
          </label>
        </div>
        <div className="flex items-center gap-5">
          <button
            type="button"
            className={`flex items-center gap-1.5 text-[11px] font-normal cursor-pointer transition-colors duration-300 bg-transparent border-0 p-0 ${
              theme === 'dark'
                ? 'text-white/50 hover:text-white/80'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Open your TrackSync home in the browser"
            onClick={() => {
              window.electron?.ipcRenderer.invoke('landing:open-myhome', user.id)
            }}
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            View Online
          </button>
          <div className="flex items-center gap-2">
            <AvatarBlock src={avatarSrc} initials={initials} name={user.name} theme={theme} />
            <span
              className={`text-[11px] ${theme === 'dark' ? 'text-white/80' : 'text-slate-700'}`}
            >
              {user.name}
            </span>
          </div>
          <button
            onClick={onSignOut}
            className={`text-[11px] transition-colors duration-300 ${
              theme === 'dark'
                ? 'text-white/50 hover:text-white/80'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign Out
          </button>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  useEffect(() => {
    const electron = window.electron
    if (!electron?.ipcRenderer) {
      setIsAuthenticated(false)
      setOnboardingDone(true)
      return
    }
    const ipcRenderer = electron.ipcRenderer

    const AUTH_RETRIES = 3
    const AUTH_RETRY_DELAY_MS = 1500

    async function checkAuthWithRetry(): Promise<{ authenticated: boolean; user?: User }> {
      for (let i = 0; i < AUTH_RETRIES; i++) {
        const res = await ipcRenderer.invoke('auth:check').catch(() => ({ authenticated: false }))
        const auth = res as { authenticated: boolean; user?: User }
        if (auth.authenticated) return auth
        if (i < AUTH_RETRIES - 1) await new Promise((r) => setTimeout(r, AUTH_RETRY_DELAY_MS))
      }
      return { authenticated: false }
    }

    Promise.all([
      checkAuthWithRetry(),
      ipcRenderer.invoke('onboarding:status').catch(() => ({ done: true })),
    ]).then(([authRes, onboardingRes]) => {
      const auth = authRes as { authenticated: boolean; user?: User }
      const onboarding = onboardingRes as { done: boolean }
      setOnboardingDone(onboarding?.done !== false)
      setIsAuthenticated(auth.authenticated)
      if (auth.user) setUser(auth.user)
    })
    const onSessionExpired = () => {
      useTimerStore.getState().reset()
      setIsAuthenticated(false)
      setUser(null)
    }
    ipcRenderer.on('auth:session-expired', onSessionExpired)
    return () => ipcRenderer.off('auth:session-expired', onSessionExpired)
  }, [])

  const handleSignOut = () => {
    window.electron?.ipcRenderer
      .invoke('auth:logout')
      .then(() => {
        useTimerStore.getState().reset()
        setIsAuthenticated(false)
        setUser(null)
      })
      .catch(() => {
        useTimerStore.getState().reset()
        setIsAuthenticated(false)
        setUser(null)
      })
  }

  useEffect(() => {
    if (!isAuthenticated) return
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return

    const onFocus = () => {
      ipc.invoke('auth:check').then((res) => {
        const auth = res as {
          authenticated: boolean
          user?: User
          offline?: boolean
          reason?: string
        }
        if (!auth.authenticated && auth.reason !== 'network') {
          useTimerStore.getState().reset()
          setIsAuthenticated(false)
          setUser(null)
        } else if (auth.authenticated && auth.user) {
          setUser(auth.user)
        }
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isAuthenticated])

  if (isAuthenticated === null || onboardingDone === null) {
    return (
      <div className="h-full w-full">
        <LoadingScreen />
      </div>
    )
  }

  if (!onboardingDone) {
    return (
      <div className="h-full w-full">
        <Onboarding onComplete={() => setOnboardingDone(true)} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="h-full w-full">
        <Login
          onSuccess={(u) => {
            setUser(u)
            setIsAuthenticated(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <DashboardShell user={user!} onSignOut={handleSignOut} />
    </div>
  )
}
