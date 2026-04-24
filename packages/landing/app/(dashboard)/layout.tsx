'use client'

import { useSession } from 'next-auth/react'
import { AppShellSidebar } from '@/components/AppShellSidebar'
import { Navbar } from '@/components/Navbar'
import { SidebarProvider } from '@/components/sidebar-context'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  /** Match AppShellSidebar: show shell whenever not logged out (it handles loading + empty role). */
  const showSidebar = status !== 'unauthenticated'

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-[3.75rem]">
        <SidebarProvider>
          <div className="flex min-h-[calc(100vh-3.75rem)] flex-col md:flex-row">
            {showSidebar && <AppShellSidebar />}
            <div className="relative flex min-w-0 flex-1 flex-col border-border bg-muted/15 md:border-l">
              <div
                className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
                aria-hidden
              >
                <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-background to-muted/35" />
                <div className="absolute -top-40 left-1/2 h-[22rem] w-[min(100%,48rem)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.18),transparent_70%)] blur-2xl" />
                <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute bottom-24 -left-16 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/[0.12]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.18] [mask-image:radial-gradient(ellipse_80%_65%_at_50%_0%,#000_20%,transparent_100%)] dark:opacity-[0.12]" />
              </div>
              <div className="relative z-10 flex min-h-[calc(100vh-3.75rem)] min-w-0 flex-1 flex-col">
                {children}
              </div>
            </div>
          </div>
        </SidebarProvider>
      </div>
    </>
  )
}
