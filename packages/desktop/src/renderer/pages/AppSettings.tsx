import { useEffect, useState } from 'react'
import { Settings, RefreshCw, Shield, ChevronRight, CheckCircle2 } from 'lucide-react'

interface SyncStatus {
  pending: number
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

  useEffect(() => {
    async function load() {
      try {
        const status = await window.electron?.ipcRenderer.invoke('sync:status') as SyncStatus | undefined
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

  const handleSyncNow = async () => {
    setSyncing(true)
    setSyncSuccess(false)
    try {
      await window.electron?.ipcRenderer.invoke('sync:trigger')
      setSyncSuccess(true)
      setTimeout(() => {
        setSyncSuccess(false)
        window.electron?.ipcRenderer.invoke('sync:status').then((s) => setSync(s as SyncStatus))
      }, 2000)
    } catch {
      // ignore
    } finally {
      setSyncing(false)
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
                      {item.sub && (
                        <p className="text-[10px] text-[#6b7280] mt-0.5">{item.sub}</p>
                      )}
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
                  <div className="px-4 py-2.5">
                    <button
                      onClick={section.action.onClick}
                      disabled={section.action.loading}
                      className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors duration-150 disabled:opacity-50"
                      style={{
                        color: section.action.accent ?? '#818cf8',
                        background: `${section.action.accent ?? '#818cf8'}15`,
                        border: `1px solid ${section.action.accent ?? '#818cf8'}25`,
                      }}
                    >
                      {(() => {
                        const ActionIcon = section.action.icon
                        return <ActionIcon className={`h-3.5 w-3.5 ${section.action.loading ? 'animate-spin' : ''}`} />
                      })()}
                      {section.action.label}
                      <ChevronRight className="h-3 w-3 ml-auto" />
                    </button>
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
    </div>
  )
}
