import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'

interface PricingCardProps {
  name: string
  price: string
  description?: string
  features: string[]
  cta: string
  href: string
  popular?: boolean
}

export function PricingCard({
  name,
  price,
  description,
  features,
  cta,
  href,
  popular,
}: PricingCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 backdrop-blur-sm transition-all hover:scale-[1.02] sm:rounded-2xl sm:p-8 ${
        popular
          ? 'border-primary/50 bg-card/90 shadow-lg shadow-primary/10'
          : 'border-border bg-card/50 hover:border-border'
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-accent px-4 py-1 text-xs font-medium text-primary-foreground">
          Popular
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">{name}</h3>
      <div className="mt-3 sm:mt-4">
        <span className="font-display text-3xl font-bold text-foreground sm:text-4xl">{price}</span>
        {price !== 'Custom' && <span className="text-muted-foreground">/user/month</span>}
      </div>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      <ul className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-6 flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all sm:mt-8 ${
          popular
            ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40'
            : 'border border-border text-foreground hover:border-border hover:bg-muted/70'
        }`}
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
