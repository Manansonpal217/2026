import { useEffect, useState } from 'react'
import { Settings, RefreshCw, Shield, ChevronRight, CheckCircle2, Wrench } from 'lucide-react'

interface SyncStatus {
  pending: number
  pendingActivity?: number
  pendingScreenshots?: number
}

type RepairResult = {
  marked: {
    completedSessionsReset: number
    activityLogsReset: number
    pendingScreenshotsRetryCleared: number
    localCompletedTotal: number
    localCompletedWithProject: number
    localCompletedWithTask: number
  }
  drain: {
    rounds: number
    rateLimitedWaits: number
    remaining: { sessions: number; activityLogs: number; screenshots: number }
  }
  desktopApiBase?: string
  sampleSyncErrors?: string[]
}

interface AppInfo {
  version?: string
  platform?: string
}

export default function AppSettingsPage() {
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo>({})
  const [syncing, setSyncing] = useState(false)
  const [syncSuccess, setSyncSuccess] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairMessage, setRepairMessage] = useState<string | null>(null)
  const [repairConfirmOpen, setRepairConfirmOpen] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const status = (await window.electron?.ipcRenderer.invoke('sync:status')) as
          | SyncStatus
          | undefined
        setSync(status ?? { pending: 0 })
        setAppInfo({
          version: '1.0.0',
          platform: navigator.platform,
        })
      } catch {
        setSync({ pending: 0 })
      }
    }
    load()
  }, [])

  const refreshSyncStatus = async () => {
    try {
      const s = (await window.electron?.ipcRenderer.invoke('sync:status')) as SyncStatus | undefined
      setSync(s ?? { pending: 0 })
    } catch {
      setSync({ pending: 0 })
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    setSyncSuccess(false)
    try {
      await window.electron?.ipcRenderer.invoke('sync:trigger')
      setSyncSuccess(true)
      setTimeout(() => {
        setSyncSuccess(false)
        void refreshSyncStatus()
      }, 2000)
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  const runRepairAndResync = async () => {
    setRepairing(true)
    setRepairMessage(null)
    try {
      const res = (await window.electron?.ipcRenderer.invoke('sync:repair-and-resync')) as
        | RepairResult
        | undefined
      if (!res) {
        setRepairMessage('Repair did not run.')
        return
      }
      const { marked, drain, desktopApiBase, sampleSyncErrors } = res
      const rem = drain.remaining
      const done = rem.sessions === 0 && rem.activityLogs === 0 && rem.screenshots === 0
      const lines: string[] = [
        `This device stores ${marked.localCompletedTotal} completed session(s); ${marked.localCompletedWithProject} have a project id, ${marked.localCompletedWithTask} have a task id.`,
        `Re-queued ${marked.completedSessionsReset} session(s), ${marked.activityLogsReset} activity row(s). Cleared retry state on ${marked.pendingScreenshotsRetryCleared} pending screenshot row(s).`,
        `Sync rounds: ${drain.rounds}${drain.rateLimitedWaits ? ` (rate-limit waits: ${drain.rateLimitedWaits})` : ''}.`,
        done
          ? 'Queue is clear.'
          : `Still pending — sessions: ${rem.sessions}, activity: ${rem.activityLogs}, screenshots: ${rem.screenshots}. The app will keep syncing in the background.`,
      ]
      if (marked.localCompletedTotal === 0) {
        lines.push(
          'No completed sessions remain on this Mac (they are removed ~30 days after a successful sync). Repair cannot change the web dashboard for those older blocks — only new tracking + sync can.'
        )
      } else if (marked.localCompletedWithTask === 0 && marked.localCompletedTotal > 0) {
        lines.push(
          'Local sessions have no task id. The web app shows "No task" until you track time with a project/task selected and sync again.'
        )
      }
      if (desktopApiBase) {
        lines.push(
          `Desktop API URL: ${desktopApiBase} — must match NEXT_PUBLIC_API_URL on the landing site or you are editing a different server.`
        )
      }
      if (sampleSyncErrors && sampleSyncErrors.length > 0) {
        lines.push(`Last sync errors: ${sampleSyncErrors.join(' | ')}`)
      }
      setRepairMessage(lines.join(' '))
      await refreshSyncStatus()
    } catch (e) {
      setRepairMessage(e instanceof Error ? e.message : 'Repair failed.')
    } finally {
      setRepairing(false)
    }
  }

  const settingSections = [
    {
      title: 'Data Sync',
      icon: RefreshCw,
      items: [
        {
          label: 'Pending sessions',
          value: sync ? String(sync.pending) : '—',
          sub: sync?.pending === 0 ? 'All synced' : `${sync?.pending} waiting to upload`,
          accent: sync && sync.pending > 0 ? '#f59e0b' : '#10b981',
        },
        {
          label: 'Pending activity rows',
          value: sync != null && sync.pendingActivity != null ? String(sync.pendingActivity) : '—',
          sub: 'Keyboard / app / URL intervals',
          accent: sync && (sync.pendingActivity ?? 0) > 0 ? '#f59e0b' : '#6b7280',
        },
        {
          label: 'Pending screenshots',
          value:
            sync != null && sync.pendingScreenshots != null ? String(sync.pendingScreenshots) : '—',
          sub: 'Encrypted files still on this device',
          accent: sync && (sync.pendingScreenshots ?? 0) > 0 ? '#f59e0b' : '#6b7280',
        },
      ],
      action: {
        label: syncSuccess ? 'Synced!' : 'Sync Now',
        icon: syncSuccess ? CheckCircle2 : RefreshCw,
        loading: syncing,
        onClick: handleSyncNow,
        accent: syncSuccess ? '#10b981' : undefined,
      },
    },
    {
      title: 'Privacy',
      icon: Shield,
      items: [
        {
          label: 'Data storage',
          value: 'Local encrypted SQLite',
          sub: 'AES-256-GCM · keys in OS keychain',
        },
      ],
    },
    {
      title: 'App Info',
      icon: Settings,
      items: [
        {
          label: 'Version',
          value: appInfo.version ?? '—',
          sub: 'TrackSync Desktop',
        },
        {
          label: 'Platform',
          value: appInfo.platform ?? '—',
          sub: undefined,
        },
      ],
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-5 py-3 border-b border-[rgba(255,255,255,0.06)] shrink-0 gap-2">
        <Settings className="h-4 w-4 text-indigo-400" />
        <span className="text-sm font-semibold text-[#f9fafb]">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {settingSections.map((section) => {
          const SectionIcon = section.icon
          return (
            <div
              key={section.title}
              className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[rgba(255,255,255,0.04)]">
                <SectionIcon className="h-3.5 w-3.5 text-[#6b7280]" />
                <span className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider">
                  {section.title}
                </span>
              </div>

              <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-[#d1d5db]">{item.label}</p>
                      {item.sub && <p className="text-[10px] text-[#6b7280] mt-0.5">{item.sub}</p>}
                    </div>
                    <span
                      className="text-xs font-semibold tabular-nums shrink-0 ml-3"
                      style={{ color: (item as { accent?: string }).accent || '#9ca3af' }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}

                {section.action && (
                  <div className="px-4 py-2.5 space-y-2">
                    <button
                      type="button"
                      onClick={section.action.onClick}
                      disabled={section.action.loading}
                      className="flex w-full items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors duration-150 disabled:opacity-50"
                      style={{
                        color: section.action.accent ?? '#818cf8',
                        background: `${section.action.accent ?? '#818cf8'}15`,
                        border: `1px solid ${section.action.accent ?? '#818cf8'}25`,
                      }}
                    >
                      {(() => {
                        const ActionIcon = section.action.icon
                        return (
                          <ActionIcon
                            className={`h-3.5 w-3.5 ${section.action.loading ? 'animate-spin' : ''}`}
                          />
                        )
                      })()}
                      {section.action.label}
                      <ChevronRight className="h-3 w-3 ml-auto" />
                    </button>
                    {section.title === 'Data Sync' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setRepairConfirmOpen(true)}
                          disabled={repairing || section.action.loading}
                          className="flex w-full items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors duration-150 disabled:opacity-50 text-amber-200/95 bg-amber-500/10 border border-amber-500/25"
                        >
                          <Wrench className={`h-3.5 w-3.5 ${repairing ? 'animate-pulse' : ''}`} />
                          Repair &amp; re-sync all local data
                          <ChevronRight className="h-3 w-3 ml-auto" />
                        </button>
                        {repairMessage ? (
                          <p className="text-[10px] text-[#9ca3af] leading-relaxed">
                            {repairMessage}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Version footer */}
        <div className="text-center py-4">
          <p className="text-[10px] text-[#374151]">
            TrackSync Desktop · All data encrypted at rest
          </p>
        </div>
      </div>

      {repairConfirmOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setRepairConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="repair-confirm-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111827] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="repair-confirm-title" className="text-sm font-semibold text-[#f9fafb]">
              Repair &amp; re-sync?
            </h2>
            <p className="mt-2 text-[11px] leading-relaxed text-[#9ca3af]">
              Re-queue all completed time sessions and activity logs for upload, then sync until the
              queue is clear.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-[10px] leading-relaxed text-[#9ca3af]">
              <li>Fixes server rows that are missing project/task after an older desktop bug.</li>
              <li>May take several minutes and use extra network; stay online and signed in.</li>
              <li>
                Screenshots that already uploaded cannot be re-sent (local files are removed after
                upload).
              </li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[rgba(255,255,255,0.12)] px-3 py-2 text-xs font-medium text-[#d1d5db] hover:bg-[rgba(255,255,255,0.06)]"
                onClick={() => setRepairConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-500/90 px-3 py-2 text-xs font-semibold text-[#111827] hover:bg-amber-400"
                onClick={() => {
                  setRepairConfirmOpen(false)
                  void runRepairAndResync()
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
