'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const faqs = [
  {
    q: 'How does time tracking work?',
    a: "TrackSync uses task-based time tracking. Connect your project tools—time is automatically attributed to the tickets and tasks you're working on. No manual timers required.",
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
    a: 'We integrate with the major project-management platforms your team already uses—Jira, Asana, Linear, Atlassian, and more—with more connectors on the way. Time is automatically linked to tasks and tickets.',
  },
  {
    q: 'What are automatic daily standups?',
    a: "TrackSync generates and posts daily standup summaries automatically—what you worked on, what you're doing next—based on your tracked time and tasks. No manual updates needed.",
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
  return (
    <main className="min-h-screen">
      <section className="px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Everything you need to know about TrackSync.
          </p>
          <Accordion
            type="single"
            collapsible
            defaultValue="faq-0"
            className="mt-10 space-y-3 sm:mt-12"
          >
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm transition-shadow data-[state=open]:shadow-md"
              >
                <AccordionTrigger className="text-base font-medium hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </main>
  )
}
