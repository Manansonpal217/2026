'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size))
  }
  return pages
}

function TestimonialCard({ quote, name, avatar, role, company }: (typeof testimonials)[number]) {
  return (
    <Card className="h-full border-border/80 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-6">
        <Quote className="h-8 w-8 shrink-0 text-primary/40" />
        <p className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground/90">
          &ldquo;{quote}&rdquo;
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={avatar} alt="" />
            <AvatarFallback className="text-xs font-medium">
              {initialsFromName(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {role}, {company}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function useCardsPerView(): number {
  const [n, setN] = useState(3)

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w < 640) setN(1)
      else if (w < 1024) setN(2)
      else setN(3)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return n
}

export function TestimonialsCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardsPerView = useCardsPerView()
  const pages = useMemo(() => chunk(testimonials, cardsPerView), [cardsPerView])

  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const pad = 8
    setCanScrollLeft(el.scrollLeft > pad)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - pad)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = 0
    checkScroll()
  }, [cardsPerView, pages.length, checkScroll])

  useEffect(() => {
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [checkScroll])

  const scrollByPage = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth : el.clientWidth, behavior: 'smooth' })
    window.setTimeout(checkScroll, 350)
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex snap-x snap-mandatory gap-0 overflow-x-auto scroll-smooth pb-2 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {pages.map((group, pageIdx) => (
          <div
            key={pageIdx}
            className="grid w-full min-w-full shrink-0 snap-start grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {group.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        ))}
      </div>

      {pages.length > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => scrollByPage('left')}
            disabled={!canScrollLeft}
            aria-label="Previous testimonials"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => scrollByPage('right')}
            disabled={!canScrollRight}
            aria-label="Next testimonials"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
