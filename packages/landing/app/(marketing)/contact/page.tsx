'use client'

import { useState } from 'react'
import { Mail, Send } from 'lucide-react'

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitted(true)
  }

  const fieldClass =
    'mt-2 w-full rounded-lg border border-border bg-muted/40 px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50'

  if (submitted) {
    return (
      <main className="min-h-screen">
        <section className="flex min-h-[60vh] flex-col items-center justify-center px-4 pt-24 sm:px-6 sm:pt-32">
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-card/80 p-8 text-center backdrop-blur-sm sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <Send className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mt-6 font-display text-2xl font-bold text-foreground">
              Thanks for reaching out
            </h2>
            <p className="mt-4 text-muted-foreground">We&apos;ll be in touch within 24 hours.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <section className="px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-28">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl">
            Get in touch
          </h1>
          <p className="mt-4 text-muted-foreground">
            Have questions? Want a demo? We&apos;d love to hear from you.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mt-10 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-sm sm:mt-12 sm:p-8"
          >
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className={fieldClass}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className={fieldClass}
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-foreground">
                  Company <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className={fieldClass}
                  placeholder="Your company"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-foreground">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  className={fieldClass}
                  placeholder="Tell us what you're looking for..."
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-6 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
            >
              Send message
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-8 flex items-center gap-3 text-muted-foreground">
            <Mail className="h-5 w-5" />
            <a href="mailto:support@tracksync.dev" className="hover:text-foreground">
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
