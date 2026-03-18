'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    q: 'How does time tracking work?',
    a: "TrackSync uses a lightweight desktop app that runs in the background. It automatically detects when you're active and tracks time spent on different applications and projects. No manual timers required—it just works.",
  },
  {
    q: 'Can users disable screenshots?',
    a: "Yes. Users have full control over screenshot settings. They can disable screenshots entirely, blur sensitive content, or set privacy windows when they don't want to be captured. Admins can configure default policies, but users always have override options.",
  },
  {
    q: 'Do you offer a free trial?',
    a: 'We offer a 14-day free trial for the Professional plan. No credit card required. You can invite your team and explore all features before committing.',
  },
  {
    q: 'What integrations do you support?',
    a: 'We integrate with Jira, Asana, Linear, and other project management tools. You can link time entries to tasks and sync work context across your stack. More integrations are coming soon.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is encrypted at rest and in transit. We use industry-standard security practices and are SOC 2 compliant. Your data stays yours—we never sell or share it.',
  },
  {
    q: 'How do I get started?',
    a: "Request a demo through our contact form. We'll set up your account, walk you through the setup, and help you invite your team. Most teams are up and running within a day.",
  },
]

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <main className="min-h-screen">
      <section className="pt-32 pb-28">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 text-muted">Everything you need to know about TrackSync.</p>
          <div className="mt-12 space-y-2">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-sm transition-colors hover:border-white/10"
              >
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-medium text-white">{faq.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                      openIndex === i ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openIndex === i && (
                  <div className="border-t border-white/5 px-6 py-4">
                    <p className="text-sm text-muted">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
