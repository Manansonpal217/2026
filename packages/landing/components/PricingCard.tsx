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
      className={`relative flex flex-col rounded-2xl border p-8 backdrop-blur-sm transition-all hover:scale-[1.02] ${
        popular
          ? 'border-primary/50 bg-white/[0.05] shadow-lg shadow-primary/10'
          : 'border-white/5 bg-white/[0.03] hover:border-white/10'
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-accent px-4 py-1 text-xs font-medium text-white">
          Popular
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-white">{name}</h3>
      <div className="mt-4">
        <span className="font-display text-4xl font-bold text-white">{price}</span>
        {price !== 'Custom' && <span className="text-muted">/user/month</span>}
      </div>
      {description && <p className="mt-2 text-sm text-muted">{description}</p>}
      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-muted">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-8 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
          popular
            ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/25 hover:shadow-primary/40'
            : 'border border-white/10 text-white hover:border-white/20 hover:bg-white/5'
        }`}
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
