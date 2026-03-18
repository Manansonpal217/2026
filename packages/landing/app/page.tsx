import Link from 'next/link'
import {
  Clock,
  Camera,
  BarChart3,
  Plug,
  ArrowRight,
  Shield,
  Activity,
  MessageSquare,
} from 'lucide-react'
import { TestimonialsCarousel } from '../components/TestimonialsCarousel'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-24 pb-20 sm:px-6 sm:pt-32 sm:pb-28">
        <div className="gradient-mesh absolute inset-0" />
        <div className="bg-grid-pattern absolute inset-0" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="font-display animate-fade-in-up text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Work intelligence for
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {' '}
              modern teams
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
            Task-based time tracking with Jira, Asana, and Atlassian. Automatic daily standups,
            screenshots, and team insights—without the micromanagement.
          </p>
          <div className="mt-10">
            <Link
              href="/contact"
              className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-6 py-3 font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
            >
              Request a demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Bar - spacing only, no borders */}
      <section className="py-12 sm:py-16">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-sm text-muted">Trusted by teams at</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:gap-x-12 sm:gap-y-6">
            {['TechFlow', 'ScaleUp', 'Nexus Labs', 'DataDrive', 'CloudNine'].map((name) => (
              <span
                key={name}
                className="font-display text-lg font-semibold text-white/70 transition-colors hover:text-white/90"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-white/5 px-4 py-20 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
              Everything you need to understand team productivity
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-muted">
              Task-based time tracking, Jira & Asana integrations, automatic standups, and analytics
              in one platform.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Clock className="h-7 w-7" />}
              title="Task-based time tracking"
              description="Track time against Jira tickets, Asana tasks, and more. Automatic attribution—no manual timers."
              delay="animate-fade-in-up-delay-1"
            />
            <FeatureCard
              icon={<Plug className="h-7 w-7" />}
              title="Jira, Asana & Atlassian"
              description="Native integrations with Jira, Asana, Linear, and Atlassian. Sync work context across your stack."
              delay="animate-fade-in-up-delay-2"
            />
            <FeatureCard
              icon={<MessageSquare className="h-7 w-7" />}
              title="Automatic daily standups"
              description="Daily standup summaries posted automatically. What you did, what you're doing—no manual updates."
              delay="animate-fade-in-up-delay-3"
            />
            <FeatureCard
              icon={<Camera className="h-7 w-7" />}
              title="Screenshots"
              description="Periodic screenshots with privacy controls. Visual context when you need it."
              delay="animate-fade-in-up-delay-4"
            />
            <FeatureCard
              icon={<BarChart3 className="h-7 w-7" />}
              title="Team insights"
              description="Reports, heatmaps, and activity trends. Understand patterns across your team."
              delay="animate-fade-in-up-delay-4"
            />
            <FeatureCard
              icon={<Shield className="h-7 w-7" />}
              title="Security & privacy"
              description="Enterprise-grade security. Data encrypted at rest and in transit."
              delay="animate-fade-in-up-delay-4"
            />
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      <section className="border-t border-white/5 px-4 py-16 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-surface via-surface to-background shadow-2xl ring-1 ring-white/10 sm:rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
            <div className="relative">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/90" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500/90" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/90" />
                </div>
                <span className="ml-3 text-xs text-muted">TrackSync Dashboard</span>
                <div className="ml-auto flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1">
                  <span className="text-[10px] text-muted">Jira</span>
                  <span className="text-[10px] text-muted">•</span>
                  <span className="text-[10px] text-muted">Asana</span>
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
                {/* Today's Standup */}
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-4 shadow-lg">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Today&apos;s Standup</span>
                  </div>
                  <p className="text-sm leading-relaxed text-white/90">
                    Shipped auth flow (PROJ-142). Working on API integration. Blocked on design
                    review.
                  </p>
                  <p className="mt-2 text-[10px] text-muted">Posted automatically at 9:00 AM</p>
                </div>
                {/* Tasks tracked */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-white">Tasks tracked today</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { id: 'PROJ-142', task: 'Auth flow', hrs: '2.5h' },
                      { id: 'PROJ-138', task: 'API integration', hrs: '1.2h' },
                      { id: 'ASANA-91', task: 'Design review', hrs: '0.5h' },
                    ].map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2"
                      >
                        <span className="shrink-0 text-xs font-medium text-white">{t.id}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
                          {t.task}
                        </span>
                        <span className="shrink-0 text-xs text-primary">{t.hrs}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-white/10 p-4 sm:p-6">
                <p className="mb-3 text-xs font-medium text-muted">Activity this week</p>
                <div className="flex items-end gap-1">
                  {[
                    { day: 'Mon', pct: 70 },
                    { day: 'Tue', pct: 88 },
                    { day: 'Wed', pct: 80 },
                    { day: 'Thu', pct: 100 },
                    { day: 'Fri', pct: 65 },
                    { day: 'Sat', pct: 20 },
                    { day: 'Sun', pct: 10 },
                  ].map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full max-w-[32px] rounded-t bg-gradient-to-t from-primary to-accent opacity-90 transition-all hover:opacity-100"
                        style={{ height: `${Math.max(d.pct, 12)}%`, minHeight: 24 }}
                      />
                      <span className="text-[9px] text-muted sm:text-[10px]">{d.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            Task-based tracking • Jira & Asana • Automatic standups
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-white/5 px-4 py-16 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-12 lg:grid-cols-4">
            <StatItem value="10K+" label="Hours tracked" />
            <StatItem value="500+" label="Teams" />
            <StatItem value="50K+" label="Standups posted" />
            <StatItem value="5+" label="Integrations" />
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-white/5 px-4 py-16 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-center text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
            What teams are saying
          </h2>
          <div className="mt-12 sm:mt-16">
            <TestimonialsCarousel />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-white/5 px-4 py-16 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex justify-center">
            <Activity className="h-12 w-12 text-primary" />
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold text-white sm:text-3xl">
            Ready to understand how your team works?
          </h2>
          <p className="mt-4 text-muted">
            Get in touch and we&apos;ll show you how TrackSync can help.
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-6 py-3 font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
          >
            Request a demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode
  title: string
  description: string
  delay?: string
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-8 shadow-lg shadow-black/20 transition-all duration-300 hover:border-primary/30 hover:bg-white/[0.04] hover:shadow-xl hover:shadow-primary/10 ${delay}`}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-opacity group-hover:bg-primary/10" />
      <div className="relative">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 text-primary transition-all duration-300 group-hover:from-primary/40 group-hover:to-accent/40">
          {icon}
        </div>
        <h3 className="mt-6 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-3 leading-relaxed text-muted">{description}</p>
      </div>
    </div>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
        <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {value}
        </span>
      </p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  )
}
