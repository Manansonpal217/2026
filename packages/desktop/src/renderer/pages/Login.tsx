import { useState } from 'react'
import Lottie from 'lottie-react'
import { Eye, EyeOff, ArrowRight, Zap, AlertCircle, Loader2 } from 'lucide-react'
import loginAnimation from '../assets/login-animation.json'

interface User {
  id: string
  name: string
  email: string
  role: string
}

export type SessionOrgSettings = { work_platform?: string } | null

interface LoginProps {
  onSuccess: (payload: { user: User; org_settings?: SessionOrgSettings }) => void
}

function InputField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete,
  rightElement,
  disabled,
  required,
  error,
  delay = 0,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  autoComplete?: string
  rightElement?: React.ReactNode
  disabled?: boolean
  required?: boolean
  error?: boolean
  delay?: number
}) {
  return (
    <div
      className="space-y-1.5 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <label htmlFor={id} className="block text-xs font-medium text-white/70">
        {label}
      </label>
      <div className="relative group">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          className={[
            'w-full h-12 rounded-2xl px-4 text-sm bg-white/5 text-white',
            'border-2 border-white/10 transition-all duration-300 outline-none',
            'placeholder:text-white/30',
            'focus:border-indigo-400/60 focus:bg-white/8 focus:shadow-[0_0_30px_rgba(99,102,241,0.15)]',
            'hover:border-white/20',
            rightElement ? 'pr-12' : '',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
            error ? 'border-red-400/50 focus:border-red-400' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {rightElement && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">{rightElement}</div>
        )}
      </div>
    </div>
  )
}

export default function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await window.electron?.ipcRenderer.invoke('auth:login', {
        email,
        password,
      })
      const result = res as {
        error?: string
        user?: User
        org_settings?: SessionOrgSettings
      }

      if (result.error) {
        setError(result.error || 'Invalid email or password')
        return
      }

      if (result.user) {
        onSuccess({ user: result.user, org_settings: result.org_settings ?? null })
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-full w-full min-h-0 bg-[#050508] overflow-hidden">
      {/* Gradient mesh background - no box */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/2 w-full h-full opacity-40 blur-[120px] animate-orb-float"
          style={{ background: 'radial-gradient(circle at 30% 30%, #4338ca 0%, transparent 50%)' }}
        />
        <div
          className="absolute -bottom-1/2 -right-1/2 w-full h-full opacity-35 blur-[100px] animate-float-subtle"
          style={{
            background: 'radial-gradient(circle at 70% 70%, #7c3aed 0%, transparent 50%)',
            animationDelay: '2s',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20 blur-[150px] animate-pulse"
          style={{
            background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
            animationDuration: '5s',
          }}
        />
      </div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Split layout: Lottie left, form right */}
      <div className="relative flex flex-1 items-center justify-center gap-16 p-8 md:p-12">
        {/* Lottie animation - no box */}
        <div className="hidden md:flex flex-1 items-center justify-center max-w-md animate-fade-in-up">
          <div className="w-full max-w-[320px] aspect-square">
            <Lottie
              animationData={loginAnimation}
              loop
              className="w-full h-full"
              style={{ filter: 'drop-shadow(0 0 40px rgba(99, 102, 241, 0.2))' }}
            />
          </div>
        </div>

        {/* Form - floating, no card */}
        <div className="flex flex-col w-full max-w-sm animate-scale-in">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_30px_rgba(99,102,241,0.4)] animate-float-subtle">
              <Zap className="h-6 w-6 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">TrackSync</h1>
              <p className="text-sm text-white/60">Sign in to your account</p>
            </div>
          </div>

          <form onSubmit={handleCredentials} className="space-y-5">
            <InputField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              autoFocus
              autoComplete="email"
              required
              delay={0}
            />

            <InputField
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              delay={50}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/40 hover:text-white/80 transition-colors duration-200"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {error && (
              <div className="flex items-start gap-3 rounded-xl border-2 border-red-400/30 bg-red-500/10 px-4 py-3 animate-error-shake">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group w-full h-12 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-[0_0_30px_rgba(99,102,241,0.3)] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98] hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] hover:scale-[1.02]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
