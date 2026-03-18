import Link from 'next/link'
import { Clock, Camera, BarChart3, Plug, ArrowRight, Shield, Quote, Activity } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-28">
        <div className="gradient-mesh absolute inset-0" />
        <div className="bg-grid-pattern absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <h1 className="font-display animate-fade-in-up text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
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
      <section className="py-16">
        <div className="relative mx-auto max-w-6xl px-6">
          <p className="text-center text-sm text-muted">Trusted by teams at</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
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
      <section id="features" className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-center text-3xl font-bold text-white sm:text-4xl">
            Everything you need to understand team productivity
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            TrackSync combines time tracking, screenshots, and analytics in one platform.
          </p>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <FeatureCard
              icon={<Clock className="h-6 w-6" />}
              title="Time tracking"
              description="Automatic time tracking with the desktop app. See where time goes without manual timers."
              delay="animate-fade-in-up-delay-1"
            />
            <FeatureCard
              icon={<Camera className="h-6 w-6" />}
              title="Screenshots"
              description="Periodic screenshots with privacy controls. Visual context when you need it."
              delay="animate-fade-in-up-delay-2"
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Team insights"
              description="Reports, heatmaps, and activity trends. Understand patterns across your team."
              delay="animate-fade-in-up-delay-3"
            />
            <FeatureCard
              icon={<Plug className="h-6 w-6" />}
              title="Integrations"
              description="Connect with Jira, Asana, and more. Sync work context across your tools."
              delay="animate-fade-in-up-delay-4"
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Security & privacy"
              description="Enterprise-grade security. Data encrypted at rest and in transit."
              delay="animate-fade-in-up-delay-4"
            />
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface/50 shadow-2xl shadow-primary/10">
            <div className="flex items-center gap-2 border-b border-white/5 bg-white/5 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
              <span className="ml-4 text-xs text-muted">app.tracksync.dev/dashboard</span>
            </div>
            <div className="bg-gradient-to-br from-surface to-background p-6">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Team Overview</h3>
                <span className="text-xs text-muted">This week</span>
              </div>
              <div className="mb-6 grid grid-cols-4 gap-4">
                {[
                  { label: 'Hours today', value: '32.5', unit: 'hrs' },
                  { label: 'Active users', value: '12', unit: '' },
                  { label: 'Projects', value: '8', unit: '' },
                  { label: 'Avg. focus', value: '4.2', unit: 'hrs' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-white/5 bg-white/5 p-4">
                    <p className="text-xs text-muted">{stat.label}</p>
                    <p className="mt-1 font-display text-xl font-semibold text-white">
                      {stat.value}
                      {stat.unit && (
                        <span className="ml-0.5 text-sm font-normal text-muted">{stat.unit}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-white/5 bg-white/5 p-4">
                <p className="mb-3 text-xs text-muted">Activity by day</p>
                <div className="flex gap-2">
                  {[
                    { day: 'Mon', hrs: 28, pct: 70 },
                    { day: 'Tue', hrs: 35, pct: 88 },
                    { day: 'Wed', hrs: 32, pct: 80 },
                    { day: 'Thu', hrs: 40, pct: 100 },
                    { day: 'Fri', hrs: 26, pct: 65 },
                    { day: 'Sat', hrs: 8, pct: 20 },
                    { day: 'Sun', hrs: 4, pct: 10 },
                  ].map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-end">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-primary/60 to-primary/30 transition-colors hover:from-primary/80 hover:to-primary/40"
                          style={{ height: `${d.pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted">{d.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center text-muted">See productivity at a glance</p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <StatItem value="10K+" label="Hours tracked" />
            <StatItem value="500+" label="Teams" />
            <StatItem value="99.9%" label="Uptime" />
            <StatItem value="4.9" label="Average rating" />
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-center text-3xl font-bold text-white sm:text-4xl">
            What teams are saying
          </h2>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <TestimonialCard
              quote="TrackSync gave us visibility into how our team actually works. No more guessing—we have data."
              name="Sarah Chen"
              role="Engineering Manager"
              company="TechFlow"
              avatar="https://ui-avatars.com/api/?name=Sarah+Chen&background=6366f1&color=fff"
            />
            <TestimonialCard
              quote="The privacy controls are a game-changer. Our team trusts the tool because they control their own data."
              name="Marcus Rodriguez"
              role="Head of Operations"
              company="ScaleUp"
              avatar="https://ui-avatars.com/api/?name=Marcus+Rodriguez&background=6366f1&color=fff"
            />
            <TestimonialCard
              quote="Finally, time tracking that doesn't feel like surveillance. It's about productivity, not policing."
              name="Emily Watson"
              role="CTO"
              company="Nexus Labs"
              avatar="https://ui-avatars.com/api/?name=Emily+Watson&background=6366f1&color=fff"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="flex justify-center">
            <Activity className="h-12 w-12 text-primary" />
          </div>
          <h2 className="mt-6 font-display text-3xl font-bold text-white">
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
      className={`group rounded-xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur-sm transition-all hover:scale-[1.02] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5 ${delay}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary transition-transform group-hover:scale-110">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-4xl font-bold text-white sm:text-5xl">
        <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {value}
        </span>
      </p>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  )
}

function TestimonialCard({
  quote,
  name,
  role,
  company,
  avatar,
}: {
  quote: string
  name: string
  role: string
  company: string
  avatar: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur-sm transition-all hover:border-white/10">
      <Quote className="h-8 w-8 text-primary/40" />
      <p className="mt-4 text-muted">&ldquo;{quote}&rdquo;</p>
      <div className="mt-6 flex items-center gap-3">
        <img
          src={avatar}
          alt={name}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
        />
        <div>
          <p className="font-medium text-white">{name}</p>
          <p className="text-sm text-muted">
            {role}, {company}
          </p>
        </div>
      </div>
    </div>
  )
}
