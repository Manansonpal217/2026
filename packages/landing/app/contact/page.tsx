'use client'

import { useState } from 'react'
import { Mail, Send } from 'lucide-react'

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="min-h-screen">
        <section className="flex min-h-[60vh] flex-col items-center justify-center px-6 pt-32">
          <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center backdrop-blur-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <Send className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mt-6 font-display text-2xl font-bold text-white">
              Thanks for reaching out
            </h2>
            <p className="mt-4 text-muted">We&apos;ll be in touch within 24 hours.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <section className="pt-32 pb-28">
        <div className="mx-auto max-w-xl px-6">
          <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">Get in touch</h1>
          <p className="mt-4 text-muted">
            Have questions? Want a demo? We&apos;d love to hear from you.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm"
          >
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-white">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-muted focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-muted focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-white">
                  Company <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-muted focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Your company"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-white">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-muted focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Tell us what you're looking for..."
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-6 py-3 font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
            >
              Send message
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-8 flex items-center gap-3 text-muted">
            <Mail className="h-5 w-5" />
            <a href="mailto:support@tracksync.dev" className="hover:text-white">
              support@tracksync.dev
            </a>
          </div>
          <p className="mt-2 text-sm text-muted">We typically respond within 24 hours.</p>
        </div>
      </section>
    </main>
  )
}
