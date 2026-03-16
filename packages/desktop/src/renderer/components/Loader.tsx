import { Clock } from 'lucide-react'

/** Full-page loader for initial load */
export function PageLoader() {
  return (
    <div className="flex flex-col h-full w-full items-center justify-center bg-[#050508] animate-fade-in">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-20 blur-[100px] animate-pulse"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent 60%)' }}
        />
      </div>
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.3)]">
            <Clock className="h-7 w-7 text-white" />
          </div>
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-white/40 border-r-white/20 animate-loader-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white/90">Loading...</p>
          <p className="text-xs text-white/50 mt-1">Preparing your workspace</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-indigo-400/80 animate-dots-pulse"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Inline loader for buttons/small areas */
export function InlineLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full border-2 border-white/20 border-t-white/80 animate-loader-spin`}
    />
  )
}

/** Skeleton placeholder for loading content */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-white/5 animate-pulse ${className}`}
      style={{ animationDuration: '1.2s' }}
    />
  )
}
