import Link from 'next/link'
import { PricingCard } from '@/components/PricingCard'
import { Badge } from '@/components/ui/badge'

export const metadata = {
  title: 'Pricing — TrackSync',
  description: 'Simple, transparent pricing. Per user, per month.',
}

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <section className="px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center text-center">
            <Badge variant="secondary" className="mb-4 font-medium">
              Pricing
            </Badge>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Per user, per month. No hidden fees. Scale as your team grows.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:mt-16 sm:gap-8 lg:grid-cols-3">
            <PricingCard
              name="Starter"
              price="$2.99"
              description="For small teams getting started"
              features={[
                'Up to 10 users',
                'Task-based time tracking',
                'Integrations with your project tools',
                'Basic reports',
                'Desktop app',
                'Email support',
              ]}
              cta="Request demo"
              href="/contact"
            />
            <PricingCard
              name="Professional"
              price="$4.99"
              description="For growing teams that need more"
              features={[
                'Unlimited users',
                'Task-based tracking + stack-wide integrations',
                'Automatic daily standups',
                'Screenshots with privacy controls',
                'Activity heatmaps',
                'Advanced reports',
                'Priority support',
              ]}
              cta="Request demo"
              href="/contact"
              popular
            />
            <PricingCard
              name="Enterprise"
              price="Custom"
              description="For organizations with custom needs"
              features={[
                'Everything in Professional',
                'SSO & SAML',
                'Dedicated support',
                'Custom integrations',
                'SLA guarantee',
                'On-premise option',
              ]}
              cta="Contact sales"
              href="/contact"
            />
          </div>
          <p className="mt-14 text-center text-sm text-muted-foreground">
            Need a custom plan?{' '}
            <Link
              href="/contact"
              className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              Contact us
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
