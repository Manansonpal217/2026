'use client'

import { useRef, useState, useEffect } from 'react'
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react'

const testimonials = [
  {
    quote:
      'TrackSync gave us visibility into how our team actually works. No more guessing—we have data.',
    name: 'Sarah Chen',
    role: 'Engineering Manager',
    company: 'TechFlow',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      'The privacy controls are a game-changer. Our team trusts the tool because they control their own data.',
    name: 'Marcus Rodriguez',
    role: 'Head of Operations',
    company: 'ScaleUp',
    avatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      "Finally, time tracking that doesn't feel like surveillance. It's about productivity, not policing.",
    name: 'Emily Watson',
    role: 'CTO',
    company: 'Nexus Labs',
    avatar:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      'The Jira integration is seamless. Time gets attributed to tickets automatically—no more manual logging.',
    name: 'David Kim',
    role: 'Product Lead',
    company: 'DataDrive',
    avatar:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote: 'Automatic standups save us 30 minutes every morning. The team actually reads them now.',
    name: 'Priya Sharma',
    role: 'Scrum Master',
    company: 'CloudNine',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      'We switched from manual timesheets to TrackSync. Reporting is 10x faster and actually accurate.',
    name: 'James Wilson',
    role: 'VP Engineering',
    company: 'Nexus Labs',
    avatar:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      'Asana + TrackSync means we finally see where time goes on each project. Game changer for client work.',
    name: 'Alex Morgan',
    role: 'Agency Director',
    company: 'Creative Studio',
    avatar:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      'The activity heatmaps helped us spot burnout before it became a problem. Leadership loves it.',
    name: 'Rachel Green',
    role: 'People Ops',
    company: 'ScaleUp',
    avatar:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&fit=crop&crop=face',
  },
  {
    quote:
      'Task-based tracking with Jira was the missing piece. We tried five tools before finding TrackSync.',
    name: 'Michael Torres',
    role: 'Tech Lead',
    company: 'TechFlow',
    avatar:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=96&h=96&fit=crop&crop=face',
  },
]

export function TestimonialsCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
    setTimeout(checkScroll, 300)
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-6 overflow-x-auto pb-4 scroll-smooth scrollbar-hide sm:gap-8"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {testimonials.map((t) => (
          <div
            key={t.name}
            className="min-w-[280px] shrink-0 sm:min-w-[320px] lg:min-w-[360px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition-all hover:border-primary/20 hover:bg-white/[0.05]">
              <Quote className="h-8 w-8 text-primary/40" />
              <p className="mt-4 leading-relaxed text-muted">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 flex items-center gap-3">
                <img
                  src={t.avatar}
                  alt={t.name}
                  className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/10"
                />
                <div>
                  <p className="font-medium text-white">{t.name}</p>
                  <p className="text-sm text-muted">
                    {t.role}, {t.company}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-2">
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5"
          aria-label="Previous testimonial"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5"
          aria-label="Next testimonial"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
