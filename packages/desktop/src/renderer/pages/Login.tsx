import { useState, useRef, useCallback } from 'react'
import Lottie from 'lottie-react'
import { Eye, EyeOff, ArrowRight, Zap, AlertCircle, Loader2, ChevronLeft } from 'lucide-react'
import loginAnimation from '../assets/login-animation.json'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface LoginProps {
  onSuccess: (user: User) => void
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
            error
              ? 'border-red-400/50 focus:border-red-400'
              : '',
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

function MfaInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, '').split('').slice(0, 6)

  const handleChange = useCallback(
    (idx: number, char: string) => {
      const sanitized = char.replace(/\D/g, '').slice(-1)
      const newDigits = [...digits]
      newDigits[idx] = sanitized
      onChange(newDigits.join(''))
      if (sanitized && idx < 5) {
        inputRefs.current[idx + 1]?.focus()
      }
    },
    [digits, onChange],
  )

  const handleKeyDown = useCallback(
    (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (!digits[idx] && idx > 0) {
          const newDigits = [...digits]
          newDigits[idx - 1] = ''
          onChange(newDigits.join('').trimEnd())
          inputRefs.current[idx - 1]?.focus()
        } else if (digits[idx]) {
          const newDigits = [...digits]
          newDigits[idx] = ''
          onChange(newDigits.join(''))
        }
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        inputRefs.current[idx - 1]?.focus()
      } else if (e.key === 'ArrowRight' && idx < 5) {
        inputRefs.current[idx + 1]?.focus()
      }
    },
    [digits, onChange],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      onChange(pasted)
      const nextIdx = Math.min(pasted.length, 5)
      inputRefs.current[nextIdx]?.focus()
    },
    [onChange],
  )

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[idx] || ''}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          autoFocus={idx === 0}
          className={[
            'w-12 h-14 text-center text-lg font-bold rounded-xl',
            'bg-white/5 text-white border-2 transition-all duration-200 outline-none',
            'focus:border-indigo-400/60 focus:shadow-[0_0_20px_rgba(99,102,241,0.2)]',
            digits[idx]
              ? 'border-indigo-400/40 bg-indigo-500/10'
              : 'border-white/10 hover:border-white/20',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

export default function Login({ onSuccess }: LoginProps) {
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [mfaCode, setMfaCode] = useState('')
  const [mfaToken, setMfaToken] = useState('')

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
        org_slug: 'demo',
      })
      const result = res as { mfa_required?: boolean; mfa_token?: string; error?: string; user?: User }

      if (result.mfa_required) {
        setMfaToken(result.mfa_token ?? '')
        setStep('mfa')
        return
      }

      if (result.error) {
        setError(result.error || 'Invalid email or password')
        return
      }

      if (result.user) {
        onSuccess(result.user)
      }
    } catch {
      setError('Connection failed. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mfaCode.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await window.electron?.ipcRenderer.invoke('auth:mfa-verify', {
        mfa_token: mfaToken,
        totp_code: mfaCode,
      })
      const result = res as { error?: string; user?: User }

      if (result.error) {
        setError(result.error || 'Invalid code')
        setMfaCode('')
        return
      }

      if (result.user) {
        onSuccess(result.user)
      }
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('credentials')
    setMfaCode('')
    setError('')
    setMfaToken('')
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
          {step === 'credentials' ? (
            <>
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
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
            </>
          ) : (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 transition-colors mb-6 -ml-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 border-2 border-indigo-400/30 mb-6">
                <svg
                  className="h-7 w-7 text-indigo-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Two-factor auth</h2>
              <p className="text-sm text-white/60 mb-6">
                Enter the 6-digit code from your authenticator app
              </p>

              <form onSubmit={handleMfa} className="space-y-6">
                <MfaInput value={mfaCode} onChange={setMfaCode} />

                {error && (
                  <div className="flex items-start gap-3 rounded-xl border-2 border-red-400/30 bg-red-500/10 px-4 py-3">
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full h-12 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-[0_0_30px_rgba(99,102,241,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98] hover:scale-[1.02]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify code'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
