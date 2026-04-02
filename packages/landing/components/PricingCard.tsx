import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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
    <Card
      className={cn(
        'relative flex flex-col overflow-hidden border-border/80 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark sm:rounded-2xl',
        popular && 'border-primary/35 shadow-md ring-1 ring-primary/15'
      )}
    >
      {popular ? (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <Badge className="px-3 py-1 font-medium shadow-sm">Popular</Badge>
        </div>
      ) : null}
      <CardHeader className={cn('pb-2 pt-10', popular && 'pt-14')}>
        <h3 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {name}
        </h3>
        <div className="mt-3 sm:mt-4">
          <span className="font-display text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
            {price}
          </span>
          {price !== 'Custom' ? (
            <span className="text-sm text-muted-foreground">/user/month</span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1 pb-2">
        <ul className="space-y-2.5 sm:space-y-3">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-sm leading-snug text-muted-foreground"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="mt-auto flex w-full flex-col items-stretch gap-0 pt-2">
        <Button
          asChild
          variant={popular ? 'default' : 'outline'}
          size="lg"
          className={cn(
            'w-full rounded-xl',
            popular && 'shadow-lg shadow-primary/20 hover:shadow-primary/30'
          )}
        >
          <Link href={href} className="inline-flex min-h-[44px] items-center justify-center gap-2">
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
