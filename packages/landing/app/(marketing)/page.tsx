'use client'

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
  Zap,
  Layers,
} from 'lucide-react'
import { TestimonialsCarousel } from '@/components/TestimonialsCarousel'
import { TrustedByMarquee } from '@/components/TrustedByMarquee'
import { AnimateOnScroll } from '@/components/AnimateOnScroll'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const TRUSTED_TEAMS = [
  'TechFlow',
  'ScaleUp',
  'Nexus Labs',
  'DataDrive',
  'CloudNine',
  'Northwind',
  'PixelForge',
  'Orbital',
  'Brightline',
  'Stacksmith',
  'RiverStone',
  'BlueHarbor',
  'Catalyst Co',
  'Meridian',
  'Velvet Box',
  'PaperPlane',
  'Torchlight',
  'KiteWorks',
  'SignalPath',
  'Aperture',
]

const sectionY = 'py-20 sm:py-24 lg:py-28'
const sectionPad = 'px-4 sm:px-6'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className={`relative overflow-hidden ${sectionPad} pb-16 pt-20 sm:pb-24 sm:pt-28`}>
        <div className="pointer-events-none absolute inset-0 gradient-mesh" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.4] dark:opacity-[0.22]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background"
          aria-hidden
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-md motion-safe:animate-fade-in-up motion-reduce:[animation:none] motion-reduce:opacity-100">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/45 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Jira · Asana · Atlassian Cloud — one workflow
          </div>
          <h1 className="motion-safe:animate-fade-in-up motion-reduce:[animation:none] motion-reduce:opacity-100 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Work intelligence for
            <span className="inline-block text-gradient bg-[length:200%_auto] motion-safe:animate-gradient-text motion-reduce:[animation:none]">
              {' '}
              modern teams
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg motion-safe:animate-fade-in-up-delay-1 motion-reduce:[animation:none] motion-reduce:opacity-100">
            Task-based time tracking that connects to the platforms your team already uses—so time
            lands on the right work automatically. Daily standups, screenshots, and team
            insights—without the micromanagement.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center motion-safe:animate-fade-in-up-delay-2 motion-reduce:[animation:none] motion-reduce:opacity-100">
            <Button
              asChild
              size="lg"
              className="rounded-xl shadow-lg shadow-primary/25 transition-transform duration-300 hover:scale-[1.02] hover:shadow-primary/35 btn-shimmer"
            >
              <Link href="/contact" className="group">
                Request access
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-xl border-2 bg-background/80 backdrop-blur-sm transition-colors duration-200 hover:bg-muted/40"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Bento highlights */}
      <section className={`${sectionPad} pb-16 sm:pb-20`}>
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="grid auto-rows-fr gap-4 sm:gap-5 md:grid-cols-3">
              <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/40 transition-all duration-300 hover:border-primary/20 hover:shadow-soft-lg md:col-span-2 md:row-span-1 dark:hover:shadow-soft-lg-dark">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/[0.07] blur-3xl transition-opacity group-hover:bg-primary/10" />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-foreground">
                  Time lands on real work
                </h3>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  Pick a ticket or task from your stack, run the timer, and push hours back to Jira
                  or Asana—no duplicate entry, no spreadsheet gymnastics.
                </p>
              </div>
              <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-primary/[0.07] via-card to-card p-6 shadow-sm ring-1 ring-primary/10 transition-all duration-300 hover:shadow-md md:row-span-2">
                <Layers className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-foreground">
                  Your stack, wired in
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" />
                    Cloud OAuth for Jira &amp; Asana
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" />
                    Self-hosted Jira via secure agent
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" />
                    Org policies: screenshots, idle, approvals
                  </li>
                </ul>
              </div>
              <div className="group rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-display text-base font-semibold text-foreground">
                  Standups on autopilot
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Summaries from what you actually tracked—posted when your team expects them.
                </p>
              </div>
              <div className="group rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-display text-base font-semibold text-foreground">
                  Built for trust
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Blur, retention, and access controls so visibility doesn&apos;t mean surveillance.
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Trust Bar — CSS marquee (outside scroll-fade wrapper) */}
      <section className="py-14 sm:py-20">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <AnimateOnScroll>
            <p className="text-center text-sm font-medium text-muted-foreground">
              Trusted by teams at
            </p>
          </AnimateOnScroll>
          <TrustedByMarquee names={TRUSTED_TEAMS} />
        </div>
      </section>

      {/* Features */}
      <section id="features" className={`border-t border-border ${sectionPad} ${sectionY}`}>
        <div className="mx-auto max-w-5xl">
          <AnimateOnScroll>
            <div className="text-center">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                Everything you need to understand team productivity
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-base leading-relaxed text-muted-foreground">
                Task-based time tracking, integrations across your project tools, automatic
                standups, and analytics in one platform.
              </p>
            </div>
          </AnimateOnScroll>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Clock className="h-7 w-7" />}
              title="Task-based time tracking"
              description="Track time against tasks and tickets from whatever tools you connect. Automatic attribution—no manual timers."
              delay="animate-fade-in-up-delay-1"
            />
            <FeatureCard
              icon={<Plug className="h-7 w-7" />}
              title="Integrations across your stack"
              description="Connect the platforms your team already relies on—from Jira and Asana to Linear, Atlassian, and beyond—so work context stays in sync."
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
      <section className={`border-t border-border ${sectionPad} ${sectionY}`}>
        <AnimateOnScroll>
          <div className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft-lg ring-1 ring-border/50 sm:rounded-3xl dark:shadow-soft-lg-dark">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-primary/[0.04]" />
              <div className="relative">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3.5 backdrop-blur-sm">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/90" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500/90" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/90" />
                  </div>
                  <span className="ml-3 text-xs font-medium text-muted-foreground">
                    TrackSync Dashboard
                  </span>
                  <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1 ring-1 ring-border/60">
                    <span className="text-[10px] text-muted-foreground">Connected tools</span>
                  </div>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
                  <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-transparent p-4 shadow-sm transition-shadow hover:shadow-md">
                    <div className="mb-3 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">
                        Today&apos;s Standup
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      Shipped auth flow (PROJ-142). Working on API integration. Blocked on design
                      review.
                    </p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Posted automatically at 9:00 AM
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-4 shadow-sm transition-shadow hover:shadow-md">
                    <div className="mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Tasks tracked today
                      </span>
                    </div>
                    <div className="space-y-2">
                      {[
                        { id: 'PROJ-142', task: 'Auth flow', hrs: '2.5h' },
                        { id: 'PROJ-138', task: 'API integration', hrs: '1.2h' },
                        { id: 'ASANA-91', task: 'Design review', hrs: '0.5h' },
                      ].map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded-lg bg-background/70 px-3 py-2 ring-1 ring-border/40 transition-colors hover:bg-background"
                        >
                          <span className="shrink-0 text-xs font-medium text-foreground">
                            {t.id}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                            {t.task}
                          </span>
                          <span className="shrink-0 text-xs font-medium text-primary">{t.hrs}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="border-t border-border p-4 sm:p-6">
                  <p className="mb-3 text-xs font-semibold text-muted-foreground">
                    Activity this week
                  </p>
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
                          className="w-full max-w-[32px] rounded-t bg-gradient-to-t from-primary/90 to-primary opacity-95 transition-all hover:opacity-100"
                          style={{ height: `${Math.max(d.pct, 12)}%`, minHeight: 24 }}
                        />
                        <span className="text-[9px] text-muted-foreground sm:text-[10px]">
                          {d.day}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Task-based tracking • Your stack • Automatic standups
            </p>
          </div>
        </AnimateOnScroll>
      </section>

      {/* Stats */}
      <section className={`border-t border-border ${sectionPad} ${sectionY}`}>
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="grid gap-10 sm:grid-cols-2 sm:gap-14 lg:grid-cols-4">
              <StatItem value="10K+" label="Hours tracked" />
              <StatItem value="500+" label="Teams" />
              <StatItem value="50K+" label="Standups posted" />
              <StatItem value="5+" label="Integrations" />
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Testimonials */}
      <section className={`border-t border-border ${sectionPad} ${sectionY}`}>
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <h2 className="text-center font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              What teams are saying
            </h2>
          </AnimateOnScroll>
          <div className="mt-12 sm:mt-16">
            <TestimonialsCarousel />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`border-t border-border ${sectionPad} ${sectionY}`}>
        <AnimateOnScroll>
          <div className="mx-auto max-w-3xl text-center">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <Activity className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Ready to understand how your team works?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Get in touch and we&apos;ll show you how TrackSync can help.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 rounded-xl shadow-lg shadow-primary/20 transition-transform duration-300 hover:scale-[1.02] hover:shadow-primary/30"
            >
              <Link href="/contact" className="inline-flex items-center gap-2">
                Request a demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </AnimateOnScroll>
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
    <Card
      className={`group relative overflow-hidden border-border/80 bg-card/90 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark ${delay}`}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/[0.06] blur-2xl transition-opacity group-hover:bg-primary/10" />
      <CardContent className="relative p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 transition-all duration-300 group-hover:bg-primary/15">
          {icon}
        </div>
        <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-3xl font-bold tabular-nums text-foreground sm:text-4xl lg:text-5xl">
        <span className="text-gradient">{value}</span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
