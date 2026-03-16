export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Animated gradient orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full opacity-20 blur-3xl animate-orb-float"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 -right-1/4 h-[500px] w-[500px] rounded-full opacity-15 blur-3xl"
          style={{
            background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
            animation: 'orb-float 10s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute -bottom-1/4 left-1/3 h-[400px] w-[400px] rounded-full opacity-10 blur-3xl"
          style={{
            background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)',
            animation: 'orb-float 12s ease-in-out infinite 2s',
          }}
        />
      </div>

      {/* Subtle grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {children}
    </div>
  )
}
