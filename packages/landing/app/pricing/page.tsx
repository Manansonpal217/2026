import Link from 'next/link'
import { PricingCard } from '../../components/PricingCard'

export const metadata = {
  title: 'Pricing — TrackSync',
  description: 'Simple, transparent pricing. Per user, per month.',
}

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-center text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            Per user, per month. No hidden fees. Scale as your team grows.
          </p>
          <div className="mt-12 grid gap-6 sm:mt-16 sm:gap-8 lg:grid-cols-3">
            <PricingCard
              name="Starter"
              price="$2.99"
              description="For small teams getting started"
              features={[
                'Up to 10 users',
                'Automatic time tracking',
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
                'Screenshots with privacy controls',
                'Activity heatmaps',
                'Jira & Asana integrations',
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
          <p className="mt-12 text-center text-sm text-muted">
            Need a custom plan?{' '}
            <Link href="/contact" className="text-primary hover:underline">
              Contact us
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
