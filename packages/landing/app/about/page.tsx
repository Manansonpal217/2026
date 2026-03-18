import Link from 'next/link'
import { ArrowRight, Target, Shield, Users, Zap } from 'lucide-react'

export const metadata = {
  title: 'About — TrackSync',
  description: 'Learn about TrackSync and our mission to bring work intelligence to modern teams.',
}

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <section className="px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-28">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            We believe teams do their best work when they have clarity—not surveillance.
          </h1>
          <p className="mt-8 text-lg text-muted">
            TrackSync was built to solve a simple problem: teams need to understand where time goes
            and how work flows, but traditional time tracking feels invasive and manual logging
            doesn&apos;t work.
          </p>
          <p className="mt-6 text-muted">
            We built automatic time tracking with privacy at the core. Screenshots that users can
            control. Insights that help managers lead better—not micromanage. Integrations that
            connect work across tools.
          </p>
        </div>
      </section>

      <section className="border-t border-white/5 px-4 py-16 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-center text-3xl font-bold text-white">Our values</h2>
          <div className="mt-12 grid gap-6 sm:mt-16 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
            <ValueCard
              icon={<Target className="h-6 w-6" />}
              title="Transparency"
              description="We believe in open, honest communication—with our users and with each other."
            />
            <ValueCard
              icon={<Shield className="h-6 w-6" />}
              title="Privacy-first"
              description="Users own their data. We build controls that put them in charge."
            />
            <ValueCard
              icon={<Users className="h-6 w-6" />}
              title="Trust"
              description="We earn trust by building tools that respect people, not surveil them."
            />
            <ValueCard
              icon={<Zap className="h-6 w-6" />}
              title="Simplicity"
              description="Complex problems deserve simple solutions. We strip away the noise."
            />
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 px-4 py-16 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-lg text-muted">
            We&apos;re a small team building tools for teams who want to work smarter—not harder.
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-6 py-3 font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
          >
            Want to learn more? Get in touch
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}

function ValueCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-6 backdrop-blur-sm transition-all hover:border-white/10">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  )
}
