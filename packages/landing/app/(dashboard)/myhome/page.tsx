'use client'

import { TeamActivityPanel } from '@/components/TeamActivityPanel'

export default function MyHomePage() {
  return (
    <main className="relative isolate min-h-[calc(100vh-8rem)] w-full overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-background to-muted/35" />
        <div className="absolute -top-40 left-1/2 h-[22rem] w-[min(100%,48rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.18),transparent_70%)] blur-2xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-24 -left-16 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/[0.12]" />
      </div>
      <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <TeamActivityPanel />
      </div>
    </main>
  )
}
