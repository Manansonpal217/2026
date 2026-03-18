import Link from 'next/link'
import { Clock, Camera, BarChart3, Plug, ArrowRight, Activity } from 'lucide-react'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://app.tracksync.dev'

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-xl font-semibold text-white">TrackSync</span>
          <Link
            href={`${ADMIN_URL}/auth/login`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24">
        <div className="absolute inset-0 bg-gradient-radial from-primary/10 via-transparent to-transparent" />
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <h1 className="animate-fade-in-up text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Work intelligence for
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {' '}
              modern teams
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            Time tracking, automatic screenshots, and team insights. Understand how your team works
            — without the micromanagement.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={`${ADMIN_URL}/auth/login`}
              className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-6 py-3 font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
            >
              Get started
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href={`${ADMIN_URL}/auth/login`}
              className="rounded-lg border border-white/10 px-6 py-3 font-medium text-white transition-colors hover:border-white/20 hover:bg-white/5"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            Everything you need to understand team productivity
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            TrackSync combines time tracking, screenshots, and analytics in one platform.
          </p>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<Clock className="h-6 w-6" />}
              title="Time tracking"
              description="Automatic time tracking with the desktop app. See where time goes without manual timers."
            />
            <FeatureCard
              icon={<Camera className="h-6 w-6" />}
              title="Screenshots"
              description="Periodic screenshots with privacy controls. Visual context when you need it."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Team insights"
              description="Reports, heatmaps, and activity trends. Understand patterns across your team."
            />
            <FeatureCard
              icon={<Plug className="h-6 w-6" />}
              title="Integrations"
              description="Connect with Jira, Asana, and more. Sync work context across your tools."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="flex justify-center">
            <Activity className="h-12 w-12 text-primary" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-white">Ready to get started?</h2>
          <p className="mt-4 text-muted">Sign in to the admin panel and invite your team.</p>
          <Link
            href={`${ADMIN_URL}/auth/login`}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white transition-colors hover:bg-primary/90"
          >
            Open admin panel
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <span className="text-sm text-muted">© TrackSync</span>
          <div className="flex gap-6">
            <Link
              href={`${ADMIN_URL}/auth/login`}
              className="text-sm text-muted transition-colors hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface/50 p-6 transition-colors hover:border-white/10">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  )
}
