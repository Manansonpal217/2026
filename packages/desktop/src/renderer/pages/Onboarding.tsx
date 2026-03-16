import { useState } from 'react'
import {
  Zap,
  ArrowRight,
  ChevronLeft,
  Clock,
  Camera,
  Activity,
  Shield,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

interface OnboardingProps {
  onComplete: () => void
}

type Step = 'welcome' | 'permissions' | 'setup'

interface PermissionItem {
  id: string
  icon: typeof Camera
  label: string
  description: string
  required: boolean
}

const PERMISSIONS: PermissionItem[] = [
  {
    id: 'screen',
    icon: Camera,
    label: 'Screen Recording',
    description: 'Required to capture periodic screenshots while the timer is running.',
    required: true,
  },
  {
    id: 'accessibility',
    icon: Activity,
    label: 'Accessibility',
    description: 'Required to monitor keyboard and mouse activity for the activity score.',
    required: true,
  },
]

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const features = [
    { icon: Clock, label: 'Time tracking', desc: 'Start a timer for any project or task' },
    { icon: Camera, label: 'Screenshots', desc: 'Automatic periodic captures at your interval' },
    { icon: Activity, label: 'Activity score', desc: 'Keyboard and mouse activity aggregated privately' },
    { icon: Shield, label: 'Encrypted locally', desc: 'All data AES-256 encrypted before syncing' },
  ]

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_24px_rgba(99,102,241,0.4)]">
          <Zap className="h-6 w-6 text-white" fill="white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#f9fafb]">TrackSync</h1>
          <p className="text-[11px] text-[#6b7280]">Work Intelligence Platform</p>
        </div>
      </div>

      <div className="space-y-2 mb-8">
        <h2 className="text-2xl font-bold text-[#f9fafb] leading-tight">
          Welcome to TrackSync
        </h2>
        <p className="text-sm text-[#9ca3af] leading-relaxed">
          Let's get you set up in a few quick steps. Your data is always encrypted and stays in your control.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-8">
        {features.map((f) => {
          const Icon = f.icon
          return (
            <div
              key={f.label}
              className="flex items-start gap-2.5 p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 mt-0.5">
                <Icon className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#f9fafb]">{f.label}</p>
                <p className="text-[10px] text-[#6b7280] mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={onNext}
        className="mt-auto w-full h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        Get started
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function PermissionsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [granted, setGranted] = useState<Record<string, boolean>>({})
  const [requesting, setRequesting] = useState<string | null>(null)

  const allRequired = PERMISSIONS.filter((p) => p.required).every((p) => granted[p.id])

  const requestPermission = async (perm: PermissionItem) => {
    setRequesting(perm.id)
    try {
      // Request via IPC — the main process will trigger the OS permission dialog
      const result = await window.electron?.ipcRenderer.invoke('permissions:request', perm.id) as boolean | undefined
      setGranted((prev) => ({ ...prev, [perm.id]: result !== false }))
    } catch {
      // If IPC not available (dev mode), simulate success
      setGranted((prev) => ({ ...prev, [perm.id]: true }))
    } finally {
      setRequesting(null)
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-[#9ca3af] transition-colors mb-6 self-start"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="space-y-1.5 mb-6">
        <h2 className="text-xl font-bold text-[#f9fafb]">Permissions</h2>
        <p className="text-sm text-[#9ca3af]">
          TrackSync needs these permissions to monitor your work. You can revoke them any time in System Preferences.
        </p>
      </div>

      <div className="space-y-3 flex-1">
        {PERMISSIONS.map((perm) => {
          const Icon = perm.icon
          const isGranted = granted[perm.id]
          const isRequesting = requesting === perm.id

          return (
            <div
              key={perm.id}
              className="flex items-start gap-3 p-4 rounded-xl border transition-colors duration-150"
              style={{
                background: isGranted ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
                borderColor: isGranted ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5"
                style={{
                  background: isGranted ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isGranted ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: isGranted ? '#10b981' : '#6b7280' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-[#f9fafb]">{perm.label}</p>
                  {perm.required && (
                    <span className="text-[9px] font-semibold text-[#6b7280] px-1.5 py-0.5 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#6b7280] leading-relaxed">{perm.description}</p>
              </div>
              {isGranted ? (
                <CheckCircle2 className="h-5 w-5 text-[#10b981] shrink-0 mt-1" />
              ) : (
                <button
                  onClick={() => requestPermission(perm)}
                  disabled={isRequesting}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/15 transition-colors shrink-0 mt-1 disabled:opacity-50"
                >
                  {isRequesting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Allow
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 space-y-2">
        <button
          onClick={onNext}
          disabled={!allRequired}
          className="w-full h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
        {!allRequired && (
          <p className="text-center text-[10px] text-[#4b5563]">
            Grant all required permissions to continue
          </p>
        )}
      </div>
    </div>
  )
}

function SetupStep({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [saving, setSaving] = useState(false)

  const handleFinish = async () => {
    setSaving(true)
    try {
      // Mark onboarding complete in the main process
      await window.electron?.ipcRenderer.invoke('onboarding:complete')
    } catch {
      // Non-fatal
    } finally {
      setSaving(false)
      onComplete()
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-[#9ca3af] transition-colors mb-6 self-start"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="space-y-1.5 mb-8">
        <h2 className="text-xl font-bold text-[#f9fafb]">You're all set!</h2>
        <p className="text-sm text-[#9ca3af]">
          TrackSync is ready to track your work. Here's what happens next:
        </p>
      </div>

      <div className="space-y-3 flex-1">
        {[
          { step: '1', label: 'Sign in', desc: 'Log in with your organization email to get started.' },
          { step: '2', label: 'Select a project', desc: 'Choose a project or task from your organization.' },
          { step: '3', label: 'Start the timer', desc: 'Hit Start and TrackSync begins monitoring quietly in the background.' },
          { step: '4', label: 'Data syncs automatically', desc: 'Sessions, screenshots, and activity logs sync when you\'re online.' },
        ].map((item) => (
          <div key={item.step} className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-400">
              {item.step}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f9fafb]">{item.label}</p>
              <p className="text-[11px] text-[#6b7280] mt-0.5 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleFinish}
        disabled={saving}
        className="mt-6 w-full h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Open TrackSync
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  )
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background overflow-hidden">
      {/* Background orbs */}
      <div
        className="absolute -top-20 -left-20 h-64 w-64 rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }}
      />

      <div className="relative w-[340px] max-h-[560px] h-full p-7 flex flex-col">
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-6">
          {(['welcome', 'permissions', 'setup'] as Step[]).map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background:
                  s === step
                    ? 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                    : step === 'setup' && s !== 'setup'
                      ? 'rgba(99,102,241,0.4)'
                      : step === 'permissions' && s === 'welcome'
                        ? 'rgba(99,102,241,0.4)'
                        : 'rgba(255,255,255,0.06)',
              }}
            />
          ))}
        </div>

        {step === 'welcome' && <WelcomeStep onNext={() => setStep('permissions')} />}
        {step === 'permissions' && (
          <PermissionsStep onNext={() => setStep('setup')} onBack={() => setStep('welcome')} />
        )}
        {step === 'setup' && (
          <SetupStep onComplete={onComplete} onBack={() => setStep('permissions')} />
        )}
      </div>
    </div>
  )
}
