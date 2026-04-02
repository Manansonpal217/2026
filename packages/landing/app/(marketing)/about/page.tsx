import Link from 'next/link'
import { ArrowRight, Target, Shield, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = {
  title: 'About — TrackSync',
  description: 'Learn about TrackSync and our mission to bring work intelligence to modern teams.',
}

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <section className="px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            We believe teams do their best work when they have clarity—not surveillance.
          </h1>
          <p className="mt-8 text-lg leading-relaxed text-muted-foreground">
            TrackSync was built to solve a simple problem: teams need to understand where time goes
            and how work flows, but traditional time tracking feels invasive and manual logging
            doesn&apos;t work.
          </p>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            We built task-based time tracking around integrations with the tools teams already
            use—not a single vendor lock-in, but a model that grows with your stack. Automatic daily
            standups. Screenshots that users can control. Insights that help managers lead
            better—not micromanage.
          </p>
        </div>
      </section>

      <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl font-semibold tracking-tight text-foreground">
            Our values
          </h2>
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

      <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-lg leading-relaxed text-muted-foreground">
            We&apos;re a small team building tools for teams who want to work smarter—not harder.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 rounded-xl shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] hover:shadow-primary/30"
          >
            <Link href="/contact" className="inline-flex items-center gap-2">
              Want to learn more? Get in touch
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
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
    <Card className="border-border/80 bg-card/90 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          {icon}
        </div>
        <h3 className="mt-4 font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
