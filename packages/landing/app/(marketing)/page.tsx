'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Play,
  Plug,
  RefreshCw,
  MessageSquare,
  Clock,
  Shield,
  BarChart3,
  Check,
  X,
  Plus,
  Minus,
  Zap,
  Users,
  Lock,
  Globe,
  Sliders,
  Smartphone,
} from 'lucide-react'
import { AnimateOnScroll } from '@/components/AnimateOnScroll'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ─────────────────── HERO PREVIEW (live timer card) ─────────────────── */
function HeroPreview() {
  const [secs, setSecs] = useState(9916)
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')

  return (
    <div
      className="relative z-[2] mx-auto mt-16 w-full max-w-[680px] overflow-hidden rounded-[20px]"
      style={{
        background: '#0b0b10',
        color: '#f9fafb',
        boxShadow: '0 40px 100px -30px rgba(37,99,235,.35), 0 0 0 1px rgba(255,255,255,.04)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-[-20px] -z-10 blur-[30px]"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(99,102,241,.5), transparent 60%)',
        }}
        aria-hidden
      />
      {/* Chrome bar */}
      <div
        className="flex items-center gap-2.5 border-b px-4 py-3"
        style={{ borderColor: 'rgba(255,255,255,.06)', background: 'rgba(255,255,255,.02)' }}
      >
        <span className="inline-flex gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="ml-2 text-xs tracking-wide" style={{ color: '#9ca3af' }}>
          TrackSync
        </span>
      </div>
      {/* Body */}
      <div className="flex flex-col items-center px-7 py-8 text-center">
        <div
          className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[.14em]"
          style={{ color: '#a5b4fc' }}
        >
          <span className="animate-recording h-2 w-2 rounded-full bg-red-500" />
          Current session · recording
        </div>
        <div
          className="my-3 font-bold tabular-nums leading-none"
          style={{ fontSize: '4rem', color: '#f9fafb' }}
        >
          {h}:{m}:{s}
        </div>
        <div
          className="mb-6 inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium"
          style={{
            background: 'rgba(99,102,241,.12)',
            color: '#c4b5fd',
            boxShadow: 'inset 0 0 0 1px rgba(99,102,241,.22)',
          }}
        >
          <span
            className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] text-[0.625rem] font-bold text-white"
            style={{ background: '#2684FF' }}
          >
            J
          </span>
          <span className="font-mono text-xs opacity-85">PROJ-142</span>
          <span className="opacity-50">·</span>
          Auth flow — SSO integration
        </div>
        <div className="grid w-full max-w-[420px] grid-cols-3 gap-2.5">
          {[
            { eyebrow: 'Standup', icon: <MessageSquare className="h-3 w-3" />, val: 'Drafted' },
            { eyebrow: 'Tracked', icon: <Clock className="h-3 w-3" />, val: '4.2h' },
            { eyebrow: '🔥 Streak', icon: null, val: '12d' },
          ].map((item) => (
            <div
              key={item.eyebrow}
              className="flex flex-col gap-1.5 rounded-xl p-3.5 text-left"
              style={{
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.06)',
              }}
            >
              <span
                className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-[.08em]"
                style={{ color: '#9ca3af' }}
              >
                {item.icon}
                {item.eyebrow}
              </span>
              <span className="text-lg font-bold tracking-tight" style={{ color: '#f9fafb' }}>
                {item.val}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────── DEEP-DIVE MOCK FRAMES ─────────────────── */
function DeepDiveMock({ kind }: { kind: string }) {
  if (kind === 'tracking')
    return (
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: '#0b0b10',
          color: '#f9fafb',
          boxShadow: '0 30px 70px -30px rgb(15 23 42 / .25)',
        }}
      >
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3 text-[0.8125rem]"
          style={{ borderColor: 'rgba(255,255,255,.06)', color: '#9ca3af' }}
        >
          <span className="inline-flex gap-[5px]">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span>Timer</span>
        </div>
        <div className="p-5">
          <div className="pb-5 pt-2 text-center">
            <div
              className="text-[0.6875rem] uppercase tracking-[.12em]"
              style={{ color: '#9ca3af' }}
            >
              Current session
            </div>
            <div
              className="mt-1.5 text-[2.75rem] font-bold tabular-nums leading-none"
              style={{ color: '#f9fafb' }}
            >
              02:45:16
            </div>
            <div
              className="mx-auto mt-2.5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{
                background: 'rgba(99,102,241,.12)',
                color: '#a5b4fc',
                boxShadow: 'inset 0 0 0 1px rgba(99,102,241,.2)',
              }}
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[0.625rem] font-bold text-white"
                style={{ background: '#2684FF' }}
              >
                J
              </span>
              PROJ-142 · Auth flow
            </div>
          </div>
          <div
            className="grid gap-1.5 border-t pt-3"
            style={{ borderColor: 'rgba(255,255,255,.06)' }}
          >
            {[
              { id: 'PROJ-138', bg: '#2684FF', task: 'API integration', h: '1.2h' },
              { id: 'ASANA-91', bg: '#F06A6A', task: 'Design review', h: '0.5h' },
            ].map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem]"
                style={{ background: 'rgba(255,255,255,.02)' }}
              >
                <span
                  className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] text-[0.625rem] font-bold text-white"
                  style={{ background: r.bg }}
                >
                  {r.id.startsWith('PROJ') ? 'J' : 'A'}
                </span>
                <span className="min-w-[68px] font-mono text-xs" style={{ color: '#9ca3af' }}>
                  {r.id}
                </span>
                <span className="flex-1" style={{ color: '#e5e7eb' }}>
                  {r.task}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: '#22c55e' }}>
                  {r.h}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

  if (kind === 'standup')
    return (
      <div
        className="overflow-hidden rounded-2xl border bg-white"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <div
          className="flex items-center justify-between border-b bg-[#fafafa] px-4 py-3 text-[0.8125rem] font-medium"
          style={{ borderColor: 'hsl(var(--border))', color: '#3f3f46' }}
        >
          <span>#eng-standup</span>
          <span className="text-xs" style={{ color: '#9ca3af' }}>
            Today · 9:00 AM
          </span>
        </div>
        <div className="p-5">
          <div className="flex gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), #8b5cf6)' }}
            >
              JS
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: '#18181b' }}>
                  Jordan Smith
                </span>
                <span className="text-[0.6875rem]" style={{ color: '#71717a' }}>
                  9:00 AM
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[0.625rem] font-medium"
                  style={{ background: '#e0e7ff', color: '#4338ca' }}
                >
                  APP
                </span>
              </div>
              <div className="mt-1.5 text-sm leading-relaxed" style={{ color: '#18181b' }}>
                <strong>Yesterday:</strong> Shipped auth flow (PROJ-142), 2h 30m. Reviewed ASANA-91.
                <br />
                <strong>Today:</strong> Working on API integration (PROJ-138).
                <br />
                <strong>Blocked:</strong> Design review for settings.
              </div>
              <div
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem]"
                style={{ background: '#f4f4f5', color: '#52525b' }}
              >
                <Zap className="h-3 w-3" />
                Auto-drafted by TrackSync · 1 edit
              </div>
            </div>
          </div>
        </div>
      </div>
    )

  if (kind === 'privacy')
    return (
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: '#0b0b10',
          color: '#f9fafb',
          boxShadow: '0 30px 70px -30px rgb(15 23 42 / .25)',
        }}
      >
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3 text-[0.8125rem]"
          style={{ borderColor: 'rgba(255,255,255,.06)', color: '#9ca3af' }}
        >
          <span className="inline-flex gap-[5px]">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span>Screenshot review</span>
        </div>
        <div className="p-5">
          <div
            className="relative mb-3 h-[130px] overflow-hidden rounded-xl"
            style={{
              background: 'linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.18))',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: 'blur(10px)',
                background:
                  'repeating-linear-gradient(110deg,rgba(255,255,255,.05) 0 16px,transparent 16px 32px)',
              }}
            />
            <div
              className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[0.6875rem]"
              style={{ color: '#e5e7eb' }}
            >
              <span>09:36 · editor</span>
              <span
                className="rounded-full px-2 py-0.5"
                style={{ background: 'rgba(34,197,94,.2)', color: '#86efac' }}
              >
                Blurred · 30d retention
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            {[
              'Blur sensitive windows',
              'Mask by application',
              'Pause captures on demand',
              'Retention: 30 days',
            ].map((t) => (
              <div
                key={t}
                className="flex items-center gap-2 text-[0.8125rem]"
                style={{ color: '#e5e7eb' }}
              >
                <span
                  className="relative inline-flex h-[18px] w-[30px] flex-shrink-0 rounded-full"
                  style={{ background: '#6366f1' }}
                >
                  <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white" />
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    )

  // insights
  return (
    <div
      className="overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <div
        className="flex items-center justify-between border-b bg-[#fafafa] px-4 py-3 text-[0.8125rem] font-medium"
        style={{ borderColor: 'hsl(var(--border))', color: '#3f3f46' }}
      >
        <span>Team Report · This week</span>
        <span className="text-xs" style={{ color: '#71717a' }}>
          7 people
        </span>
      </div>
      <div className="p-5">
        <div className="mb-3.5 grid grid-cols-3 gap-2.5">
          {[
            { v: '164h', l: 'Tracked' },
            { v: '38', l: 'Tickets shipped' },
            { v: '91%', l: 'Auto-attributed' },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-xl border p-3"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div
                className="text-[1.375rem] font-bold tracking-tight"
                style={{ color: '#18181b' }}
              >
                {s.v}
              </div>
              <div className="mt-0.5 text-[0.6875rem]" style={{ color: '#71717a' }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 items-end gap-2" style={{ height: 90 }}>
          {[
            { d: 'M', p: 55 },
            { d: 'T', p: 78 },
            { d: 'W', p: 92 },
            { d: 'Th', p: 68 },
            { d: 'F', p: 100 },
            { d: 'Sa', p: 14 },
            { d: 'Su', p: 8 },
          ].map((b) => (
            <div key={b.d} className="flex h-full flex-col items-center gap-1">
              <div
                className="w-full rounded-t-[6px]"
                style={{
                  height: `${b.p}%`,
                  minHeight: 4,
                  background: 'linear-gradient(180deg,#6366f1,#2563eb)',
                }}
              />
              <span className="text-[0.625rem]" style={{ color: '#71717a' }}>
                {b.d}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────── FEATURE DEEP-DIVE (tabbed) ─────────────────── */
function FeatureDeepDive() {
  const tabs = [
    {
      k: 'tracking',
      label: 'Task-based tracking',
      icon: Clock,
      tag: 'Tracking',
      title: 'Time lands on real work.',
      desc: 'Pick a ticket from Jira, Asana, or Linear. The timer attributes every minute to that specific task. No generic "meetings" or "dev work" buckets — every hour is a story.',
      bullets: [
        'Real-time push to Jira worklogs & Asana time fields',
        'Idle detection with adjustable thresholds',
        'Pause, resume, and switch tasks without losing context',
      ],
      mock: 'tracking',
    },
    {
      k: 'standups',
      label: 'Daily standups',
      icon: MessageSquare,
      tag: 'Standups',
      title: 'Daily standups on autopilot.',
      desc: "What you did, what you're doing, what you're blocked on — drafted from your tracked hours and tickets, posted to Slack, reviewed in one click.",
      bullets: [
        'Drafts appear in the app before your standup channel wakes up',
        'Edit, approve, or let them post automatically',
        'Posts ship as you — your name, your voice',
      ],
      mock: 'standup',
    },
    {
      k: 'privacy',
      label: 'Privacy controls',
      icon: Shield,
      tag: 'Privacy',
      title: "Built for trust. Visibility doesn't mean surveillance.",
      desc: 'Screenshots are blurred by default. Retention is configurable. Employees can see and delete anything captured about them. Admins set org-wide policies, not per-person rules.',
      bullets: [
        'Blur, mask, and redact captures before they leave the device',
        '30-day default retention (configurable down to 24h)',
        'SOC2 Type II, data encrypted in transit and at rest',
      ],
      mock: 'privacy',
    },
    {
      k: 'insights',
      label: 'Team insights',
      icon: BarChart3,
      tag: 'Reports',
      title: 'Understand how your team actually works.',
      desc: 'Heatmaps, weekly rollups, project-level trends — not activity scores. Reports show outcomes: what shipped, what stalled, where hours went.',
      bullets: [
        'Project & sprint-level views',
        'Export to CSV and Google Sheets',
        'Weekly digest emails for managers',
      ],
      mock: 'insights',
    },
  ]

  const [active, setActive] = useState('tracking')
  const current = tabs.find((t) => t.k === active) || tabs[0]

  return (
    <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <AnimateOnScroll>
          <div className="mb-10 flex flex-col items-center gap-3.5 text-center">
            <Badge>The product</Badge>
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
              Everything your team needs in one app.
            </h2>
          </div>
        </AnimateOnScroll>

        {/* Tab strip */}
        <div className="mx-auto mb-10 flex w-fit flex-wrap justify-center gap-1.5 rounded-xl bg-muted/60 p-1.5">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.k}
                onClick={() => setActive(t.k)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm transition-all duration-200',
                  active === t.k
                    ? 'bg-background font-semibold text-foreground shadow-sm'
                    : 'font-medium text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col items-start gap-1.5">
            <Badge>{current.tag}</Badge>
            <h3 className="mt-3 text-[clamp(1.7rem,2.8vw,2.4rem)] font-bold leading-[1.15] tracking-tight">
              {current.title}
            </h3>
            <p className="mt-2.5 text-[1.0625rem] leading-[1.65] text-muted-foreground">
              {current.desc}
            </p>
            <ul className="mt-6 grid gap-3.5">
              {current.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]">
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), #8b5cf6)' }}
                  >
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <DeepDiveMock kind={current.mock} />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────── FAQ ACCORDION ─────────────────── */
function Faq() {
  const items = [
    {
      q: 'Do you track keystrokes or monitor every activity?',
      a: 'No. TrackSync is task-based — time attributes to specific tickets you choose, not to ambient activity. No keystroke logging, no mouse movement scoring, no productivity scores. Screenshots are optional and blurred by default.',
    },
    {
      q: 'Will this feel like surveillance to my team?',
      a: "That's the exact trap we built TrackSync to avoid. Employees see everything captured about them. They can pause tracking. Admins set team-wide policies. Our customers report 4.8/5 employee satisfaction on the tool itself.",
    },
    {
      q: 'Which project tools do you integrate with?',
      a: 'Jira (Cloud & Data Center), Asana, Linear, and Atlassian Cloud today. Slack and Microsoft Teams for standup posting. GitHub for PR linking. More integrations roll out monthly — the desktop app is built around an integration SDK.',
    },
    {
      q: 'How does billing work?',
      a: 'Per seat, per month. Team is $9/seat. Annual billing gets 2 months free. No charge for inactive seats. Enterprise includes volume discounts, SSO, and a dedicated success manager.',
    },
    {
      q: 'Is it self-hosted?',
      a: 'SaaS is the default. Enterprise customers can run TrackSync against self-hosted Jira Data Center via a secure agent — no outbound connection to our cloud required from the Jira side.',
    },
    {
      q: 'What about SOC2 and GDPR?',
      a: 'SOC2 Type II audited. GDPR-compliant with a DPA available. Data residency in US or EU. All data encrypted in transit and at rest. Our security page has the details.',
    },
  ]
  const [open, setOpen] = useState<number>(0)

  return (
    <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <AnimateOnScroll>
          <div className="mb-10 flex flex-col items-center gap-3.5 text-center">
            <Badge>FAQ</Badge>
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
              Answers before you ask.
            </h2>
          </div>
        </AnimateOnScroll>
        <div className="mx-auto max-w-3xl space-y-2.5">
          {items.map((it, i) => (
            <div
              key={it.q}
              className={cn(
                'overflow-hidden rounded-xl border bg-card transition-colors duration-200',
                open === i ? 'border-primary/30' : 'border-border'
              )}
            >
              <button
                className="flex w-full items-center justify-between gap-4 px-5 py-[18px] text-left text-[0.9375rem] font-semibold text-foreground hover:bg-muted/40"
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                <span>{it.q}</span>
                {open === i ? (
                  <Minus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                ) : (
                  <Plus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-[0.9375rem] leading-[1.65] text-muted-foreground">
                  {it.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────── BADGE ATOM ─────────────────── */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/[0.15] px-2.5 py-0.5 text-xs font-medium text-primary">
      {children}
    </span>
  )
}

/* ─────────────────── MAIN PAGE ─────────────────── */
export default function Home() {
  return (
    <main className="min-h-screen">
      {/* ── HERO ── */}
      <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32">
        {/* Mesh gradient */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'radial-gradient(ellipse 65% 45% at 50% 0%, hsl(var(--primary) / .10), transparent 62%), ' +
              'radial-gradient(ellipse 45% 30% at 0% 40%, hsl(var(--primary) / .06), transparent 60%), ' +
              'radial-gradient(ellipse 45% 30% at 100% 40%, rgba(139,92,246,.13), transparent 60%)',
          }}
          aria-hidden
        />
        {/* Dot grid */}
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-grid-pattern opacity-[0.4] dark:opacity-[0.22]"
          style={{
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 70%)',
          }}
          aria-hidden
        />
        {/* Floating orbs */}
        <div
          className="pointer-events-none absolute left-[8%] top-[10%] z-0 h-[280px] w-[280px] animate-float rounded-full blur-[60px]"
          style={{ background: 'rgba(37,99,235,.18)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute right-[5%] top-[50%] z-0 h-[220px] w-[220px] animate-float-slow rounded-full blur-[60px]"
          style={{ background: 'rgba(139,92,246,.18)' }}
          aria-hidden
        />

        <div className="relative z-[1] mx-auto max-w-5xl">
          <div className="flex flex-col items-center text-center">
            {/* Live pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[0.8125rem] text-muted-foreground shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/45 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Now connecting — Jira · Asana · Linear · Atlassian Cloud
            </div>

            {/* Title */}
            <h1 className="mt-6 max-w-[18ch] text-[clamp(2.8rem,6.2vw,4.5rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
              Time tracking that
              <br />
              <span className="text-gradient bg-[length:200%_200%] motion-safe:animate-gradient-text motion-reduce:opacity-100">
                knows what you&apos;re working on.
              </span>
            </h1>

            {/* Lede */}
            <p className="mx-auto mt-6 max-w-[52ch] text-[1.15rem] leading-[1.6] text-muted-foreground">
              TrackSync connects to the tools your team already uses—so every hour lands on the
              right ticket automatically. Daily standups, screenshots, and team insights—without the
              micromanagement.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-xl btn-shimmer text-primary-foreground"
                style={{
                  background: 'linear-gradient(110deg, hsl(var(--primary)), #8b5cf6)',
                  boxShadow: '0 10px 28px -6px rgba(37,99,235,.35)',
                  border: 0,
                }}
              >
                <Link href="/contact" className="group">
                  Start free trial
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-xl border-2 bg-background/80 backdrop-blur-sm hover:bg-muted/40"
              >
                <Link href="/contact">
                  <Play className="h-4 w-4" /> Watch demo · 90s
                </Link>
              </Button>
            </div>

            {/* Trust line */}
            <div className="mt-10 flex flex-col items-center gap-3.5 opacity-85">
              <span className="text-xs uppercase tracking-[.06em] text-muted-foreground">
                Trusted by teams at
              </span>
              <div className="flex max-w-[640px] flex-wrap justify-center gap-7">
                {[
                  'Nexus Labs',
                  'Meridian',
                  'DataDrive',
                  'ScaleUp Inc',
                  'Fieldline',
                  'Orbitfleet',
                ].map((n) => (
                  <span
                    key={n}
                    className="text-[0.875rem] font-semibold tracking-[-0.01em] text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* ── LOGO BAR ── */}
      <section className="border-b border-t border-border/60 bg-muted/30 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5">
          <span className="text-[0.8125rem] tracking-[.04em] text-muted-foreground">
            Integrates with the tools you already use
          </span>
          <div className="flex flex-wrap justify-center gap-7 sm:gap-9">
            {[
              { n: 'Jira', c: '#2684FF' },
              { n: 'Asana', c: '#F06A6A' },
              { n: 'Linear', c: '#5E6AD2' },
              { n: 'Atlassian', c: '#0052CC' },
              { n: 'Slack', c: '#611F69' },
              { n: 'GitHub', c: '#24292f' },
            ].map((t) => (
              <div
                key={t.n}
                className="inline-flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-[-0.01em] text-foreground"
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[0.8125rem] font-bold text-white"
                  style={{ background: t.c }}
                >
                  {t.n[0]}
                </span>
                {t.n}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM / SHIFT ── */}
      <section className="border-b border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="mx-auto mb-14 flex max-w-[640px] flex-col items-center gap-3.5 text-center">
              <Badge>Why TrackSync</Badge>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
                Time tracking is broken. We fixed it.
              </h2>
              <p className="text-[1.0625rem] leading-[1.65] text-muted-foreground">
                Every other tool asks your team to stop working so they can log what they just
                worked on. TrackSync watches the work—and writes it down.
              </p>
            </div>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-[1fr_60px_1fr]">
              {/* Old way */}
              <div className="rounded-[18px] border border-border bg-muted/50 p-8">
                <div className="mb-5 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
                  Old way
                </div>
                <ul className="grid gap-3.5">
                  {[
                    'Stop working, open spreadsheet',
                    "Guess your hours at week's end",
                    'Surveillance tools that track every keystroke',
                    'Manually written daily standup messages',
                    'Time logs that never match the tickets',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-[0.9375rem] leading-[1.5] text-muted-foreground line-through decoration-muted-foreground/50"
                    >
                      <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500 no-underline [text-decoration:none]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Arrow */}
              <div
                className="hidden h-12 w-12 items-center justify-center self-center justify-self-center rounded-full md:flex"
                style={{
                  background: 'hsl(var(--primary) / .1)',
                  boxShadow: '0 0 30px hsl(var(--primary) / .3)',
                  color: 'hsl(var(--primary))',
                }}
              >
                <ArrowRight className="h-5 w-5" />
              </div>

              {/* With TrackSync */}
              <div
                className="rounded-[18px] border p-8"
                style={{
                  background:
                    'linear-gradient(135deg, hsl(var(--primary) / .08), hsl(var(--card)))',
                  borderColor: 'hsl(var(--primary) / .2)',
                  boxShadow: '0 18px 40px -16px rgb(37 99 235 / .15)',
                }}
              >
                <div className="mb-5 text-xs font-semibold uppercase tracking-[.12em]">
                  <span className="text-gradient bg-[length:200%_200%] motion-safe:animate-gradient-text">
                    With TrackSync
                  </span>
                </div>
                <ul className="grid gap-3.5">
                  {[
                    'Pick a ticket. Hit start. Hours land on the right work.',
                    'Real-time tracking, pushed back to Jira/Asana',
                    'Privacy-first — blurred screenshots, team-controlled policies',
                    'Daily standups drafted from what you actually shipped',
                    'Hours, tickets, and outcomes all connected',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-[0.9375rem] leading-[1.5]"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="border-b border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="mb-14 flex flex-col items-center gap-3.5 text-center">
              <Badge>How it works</Badge>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
                Four clicks from zero to tracked.
              </h2>
              <p className="max-w-[60ch] text-[1.0625rem] leading-[1.65] text-muted-foreground">
                No spreadsheets. No browser extensions. No manager dashboards your team has to fake
                their way through.
              </p>
            </div>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  n: '01',
                  Icon: Plug,
                  title: 'Connect your stack',
                  desc: 'OAuth into Jira, Asana, Linear, or Atlassian Cloud in 30 seconds. Tickets sync automatically.',
                },
                {
                  n: '02',
                  Icon: Play,
                  title: 'Hit start on a ticket',
                  desc: 'Pick from your actual backlog — tasks assigned to you appear in the timer. One click to track.',
                },
                {
                  n: '03',
                  Icon: RefreshCw,
                  title: 'Hours flow back automatically',
                  desc: 'Your time shows up on the ticket in Jira or Asana — no double entry, no spreadsheets, no Fridays lost to paperwork.',
                },
                {
                  n: '04',
                  Icon: MessageSquare,
                  title: 'Standups write themselves',
                  desc: 'Every morning, TrackSync posts a summary of what you shipped to Slack — drafted from real work, not memory.',
                },
              ].map((step, i) => (
                <div key={step.n} className="relative rounded-2xl border border-border bg-card p-7">
                  <div
                    className="absolute right-5 top-4 font-mono text-[2.5rem] font-extrabold leading-none tracking-[-0.03em]"
                    style={{ color: 'hsl(var(--primary) / .1)' }}
                  >
                    {step.n}
                  </div>
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                    <step.Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3.5 text-[1.125rem] font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[0.9375rem] leading-[1.6] text-muted-foreground">
                    {step.desc}
                  </p>
                  {i < 3 && (
                    <span
                      className="absolute right-[-14px] top-1/2 z-10 hidden h-0.5 w-6 lg:block"
                      style={{
                        background: 'linear-gradient(90deg, hsl(var(--primary) / .4), transparent)',
                      }}
                      aria-hidden
                    />
                  )}
                </div>
              ))}
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── FEATURE DEEP-DIVE ── */}
      <FeatureDeepDive />

      {/* ── FEATURE GRID ── */}
      <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="mb-12 flex flex-col items-center gap-3.5 text-center">
              <Badge>And a lot more</Badge>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
                The small things that make it work.
              </h2>
            </div>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  Icon: Zap,
                  title: 'Real-time sync',
                  desc: 'Hours push to Jira or Asana the moment they happen — nothing to submit.',
                },
                {
                  Icon: Users,
                  title: 'Team rollups',
                  desc: 'Weekly digests by project, sprint, or person. Export to CSV.',
                },
                {
                  Icon: Lock,
                  title: 'SOC2 Type II',
                  desc: 'Enterprise-grade security. Data encrypted at rest and in transit.',
                },
                {
                  Icon: Globe,
                  title: 'Works offline',
                  desc: 'Desktop app keeps tracking through WiFi drops and syncs when back online.',
                },
                {
                  Icon: Sliders,
                  title: 'Team-level policies',
                  desc: 'Screenshots, idle, retention — admins set org-wide rules, not per-person.',
                },
                {
                  Icon: Smartphone,
                  title: 'Mobile companion',
                  desc: 'iOS + Android apps for tracking away from your desk.',
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark"
                >
                  <div className="absolute -right-7 -top-7 h-36 w-36 rounded-full bg-primary/[0.08] blur-[36px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                    <f.Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-3.5 text-[1.125rem] font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-[1.6] text-muted-foreground">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="border-t border-border px-6 py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div
              className="relative overflow-hidden rounded-3xl border border-border p-12 sm:p-14"
              style={{
                background:
                  'linear-gradient(135deg, hsl(var(--primary) / .05) 0%, hsl(var(--card)) 50%, hsl(var(--primary) / .03) 100%)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-60"
                aria-hidden
              />
              <div className="relative grid grid-cols-2 gap-10 text-center sm:gap-14 lg:grid-cols-4">
                {[
                  { v: '10K+', l: 'Hours tracked daily' },
                  { v: '500+', l: 'Teams shipping with TrackSync' },
                  { v: '91%', l: 'Of hours auto-attributed' },
                  { v: '4.8', l: 'Avg rating on employee surveys' },
                ].map((r) => (
                  <div key={r.l}>
                    <div className="text-[3rem] font-extrabold leading-none tracking-[-0.02em]">
                      <span className="text-gradient bg-[length:200%_200%] motion-safe:animate-gradient-text">
                        {r.v}
                      </span>
                    </div>
                    <div className="mt-2 text-[0.875rem] text-muted-foreground">{r.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="mb-10 flex flex-col items-center gap-3.5 text-center">
              <Badge>Customer stories</Badge>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
                Teams that stopped hating time tracking.
              </h2>
            </div>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                {
                  who: 'Maya Ruiz',
                  role: 'Eng Manager',
                  team: 'ScaleUp Inc',
                  initials: 'MR',
                  text: "Standups used to be a 30-minute meeting. Now they just happen — drafted, posted, done. Everyone's on the same page before coffee.",
                  metric: '30min → 0min per day',
                },
                {
                  who: 'Theo Lin',
                  role: 'Ops Lead',
                  team: 'Nexus Labs',
                  initials: 'TL',
                  text: 'We tried three time trackers. Only TrackSync actually routes time back to Jira correctly. Our billing team stopped asking me questions on Fridays.',
                  metric: '8h/week reclaimed',
                },
                {
                  who: 'Priya Shah',
                  role: 'Director of Eng',
                  team: 'DataDrive',
                  initials: 'PS',
                  text: "The privacy controls are what sold us. Our team actually likes it — they don't feel watched, and managers see the outcomes that matter.",
                  metric: '4.8/5 team satisfaction',
                },
              ].map((q) => (
                <div
                  key={q.who}
                  className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark"
                >
                  <div
                    className="absolute right-5 top-5 rounded-md px-2.5 py-1 text-[0.6875rem] font-semibold"
                    style={{ background: 'hsl(var(--primary) / .1)', color: 'hsl(var(--primary))' }}
                  >
                    {q.metric}
                  </div>
                  <p className="mb-4 mt-2 text-[1.0625rem] leading-[1.65]">
                    &ldquo;{q.text}&rdquo;
                  </p>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{
                        background: 'linear-gradient(135deg, hsl(var(--primary)), #8b5cf6)',
                      }}
                    >
                      {q.initials}
                    </div>
                    <div>
                      <div className="text-[0.875rem] font-semibold">{q.who}</div>
                      <div className="text-xs text-muted-foreground">
                        {q.role} · {q.team}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="border-t border-border px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div className="mb-12 flex flex-col items-center gap-3.5 text-center">
              <Badge>Pricing</Badge>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.15] tracking-tight">
                Simple. Per seat. No surprises.
              </h2>
              <p className="text-[1.0625rem] leading-[1.65] text-muted-foreground">
                14-day free trial on Team. No credit card required.
              </p>
            </div>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <div className="grid items-stretch gap-5 sm:grid-cols-3">
              {[
                {
                  name: 'Starter',
                  price: 'Free',
                  sub: 'Up to 3 seats',
                  highlighted: false,
                  features: [
                    'Task-based tracking',
                    'Jira / Asana / Linear integrations',
                    '7-day history',
                    'Community support',
                  ],
                  cta: 'Start free',
                },
                {
                  name: 'Team',
                  price: '$9',
                  per: '/seat/month',
                  sub: 'For growing teams',
                  highlighted: true,
                  features: [
                    'Everything in Starter',
                    'Daily standups',
                    'Screenshots + privacy controls',
                    '90-day history',
                    'Slack + Teams integration',
                    'Priority support',
                  ],
                  cta: 'Start 14-day trial',
                },
                {
                  name: 'Enterprise',
                  price: 'Custom',
                  sub: 'SSO, SOC2, custom SLAs',
                  highlighted: false,
                  features: [
                    'Everything in Team',
                    'SSO / SAML',
                    'Unlimited history',
                    'SOC2 report',
                    'Dedicated success manager',
                  ],
                  cta: 'Talk to sales',
                },
              ].map((plan) => (
                <div
                  key={plan.name}
                  className={cn(
                    'relative flex flex-col gap-6 rounded-[18px] border p-8 transition-all duration-200',
                    plan.highlighted
                      ? 'border-primary/30 sm:scale-[1.02]'
                      : 'border-border bg-card hover:-translate-y-0.5 hover:shadow-soft-lg dark:hover:shadow-soft-lg-dark'
                  )}
                  style={
                    plan.highlighted
                      ? {
                          background:
                            'linear-gradient(180deg, hsl(var(--primary) / .03), hsl(var(--card)))',
                          boxShadow: '0 22px 60px -20px rgb(37 99 235 / .25)',
                        }
                      : {}
                  }
                >
                  {plan.highlighted && (
                    <div
                      className="absolute left-1/2 top-[-13px] -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
                      style={{
                        background: 'linear-gradient(135deg, hsl(var(--primary)), #8b5cf6)',
                        boxShadow: '0 6px 18px -4px rgb(37 99 235 / .4)',
                      }}
                    >
                      Most popular
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-[1.125rem] font-semibold">{plan.name}</h3>
                    <div className="flex items-baseline gap-1.5 text-[2.75rem] font-extrabold leading-none tracking-[-0.02em]">
                      {plan.highlighted ? (
                        <span className="text-gradient bg-[length:200%_200%] motion-safe:animate-gradient-text">
                          {plan.price}
                        </span>
                      ) : (
                        <span>{plan.price}</span>
                      )}
                      {'per' in plan && plan.per && (
                        <span className="text-[0.875rem] font-medium text-muted-foreground">
                          {plan.per}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{plan.sub}</div>
                  </div>
                  <ul className="flex flex-1 flex-col gap-3">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-[0.9375rem] leading-[1.45]"
                      >
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary"
                          strokeWidth={2.5}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    size="lg"
                    variant={plan.highlighted ? 'default' : 'outline'}
                    className={cn(
                      'w-full rounded-xl',
                      plan.highlighted && 'btn-shimmer text-primary-foreground'
                    )}
                    style={
                      plan.highlighted
                        ? {
                            background: 'linear-gradient(110deg, hsl(var(--primary)), #8b5cf6)',
                            boxShadow: '0 10px 28px -6px rgba(37,99,235,.35)',
                            border: 0,
                          }
                        : {}
                    }
                  >
                    <Link href="/contact">{plan.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── FAQ ── */}
      <Faq />

      {/* ── FINAL CTA ── */}
      <section className="border-t border-border px-4 pb-20 pt-10 sm:px-6 sm:pb-28 lg:pb-32">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll>
            <div
              className="relative overflow-hidden rounded-3xl border border-border p-16 text-center"
              style={{
                background:
                  'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--primary) / .04) 100%)',
              }}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-[-50%] h-[500px] w-[600px] -translate-x-1/2 blur-[60px]"
                style={{
                  background:
                    'radial-gradient(ellipse, hsl(var(--primary) / .25), transparent 70%)',
                }}
                aria-hidden
              />
              <div className="relative flex flex-col items-center">
                <Badge>Ready when you are</Badge>
                <h2 className="mx-auto mt-3.5 max-w-[20ch] text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.15] tracking-tight">
                  Stop asking your team to remember what they did.
                </h2>
                <p className="mx-auto mt-2.5 max-w-[52ch] text-[1.0625rem] leading-[1.65] text-muted-foreground">
                  Start a free 14-day trial. Connect your stack in under a minute. Your first
                  standup posts tomorrow morning.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button
                    asChild
                    size="lg"
                    className="rounded-xl btn-shimmer text-primary-foreground"
                    style={{
                      background: 'linear-gradient(110deg, hsl(var(--primary)), #8b5cf6)',
                      boxShadow: '0 10px 28px -6px rgba(37,99,235,.35)',
                      border: 0,
                    }}
                  >
                    <Link href="/contact" className="group">
                      Start free trial
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-xl border-2 hover:bg-muted/40"
                  >
                    <Link href="/contact">Book a demo</Link>
                  </Button>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-5 text-[0.8125rem] text-muted-foreground">
                  {['No credit card', 'Cancel anytime', '14-day trial'].map((item) => (
                    <span key={item} className="inline-flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-emerald-500" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </main>
  )
}
