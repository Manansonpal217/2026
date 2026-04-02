'use client'

import { useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitted(true)
  }

  const fieldClass =
    'mt-2 h-11 rounded-xl border-border bg-background shadow-sm transition-all hover:border-border focus:border-primary/50'

  if (submitted) {
    return (
      <main className="min-h-screen">
        <section className="flex min-h-[60vh] flex-col items-center justify-center px-4 pt-24 sm:px-6 sm:pt-32">
          <Card className="mx-auto max-w-md border-border/80 shadow-soft-lg dark:shadow-soft-lg-dark">
            <CardContent className="p-8 text-center sm:p-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
                <Send className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mt-6 font-display text-2xl font-semibold tracking-tight text-foreground">
                Thanks for reaching out
              </h2>
              <p className="mt-4 text-muted-foreground">We&apos;ll be in touch within 24 hours.</p>
            </CardContent>
          </Card>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <section className="px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Get in touch
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Have questions? Want a demo? We&apos;d love to hear from you.
          </p>
          <Card className="mt-10 border-border/80 shadow-soft-lg dark:shadow-soft-lg-dark sm:mt-12">
            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-foreground">
                    Name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    placeholder="Your name"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm font-medium text-foreground">
                    Company <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="company"
                    name="company"
                    type="text"
                    placeholder="Your company"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message" className="text-sm font-medium text-foreground">
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    className="mt-2 min-h-[140px] rounded-xl border-border bg-background shadow-sm"
                    placeholder="Tell us what you're looking for..."
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="mt-4 w-full rounded-xl shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30"
                >
                  Send message
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="mt-8 flex items-center gap-3 text-muted-foreground">
            <Mail className="h-5 w-5 shrink-0 text-primary/80" />
            <a
              href="mailto:support@tracksync.dev"
              className="text-sm font-medium transition-colors hover:text-foreground"
            >
              support@tracksync.dev
            </a>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            We typically respond within 24 hours.
          </p>
        </div>
      </section>
    </main>
  )
}
