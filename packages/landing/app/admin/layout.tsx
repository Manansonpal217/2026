import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { AppShellSidebar } from '@/components/AppShellSidebar'
import { Navbar } from '@/components/Navbar'
import { SidebarProvider } from '@/components/sidebar-context'
import { authOptions } from '@/lib/auth'
import { ADMIN_DENIED_FALLBACK_HREF, mayAccessAdminConsole } from '@/lib/admin-gate'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!mayAccessAdminConsole(session?.user)) {
    redirect(ADMIN_DENIED_FALLBACK_HREF)
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-[3.75rem]">
        <SidebarProvider>
          <div className="flex min-h-[calc(100vh-3.75rem)] flex-col md:flex-row">
            <AppShellSidebar />
            <div className="flex min-w-0 flex-1 flex-col border-border md:border-l">
              <div className="relative isolate flex-1 px-4 py-6 sm:px-6 lg:px-8">
                <div
                  className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
                  aria-hidden
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
                  <div className="absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full bg-violet-500/[0.09] blur-3xl dark:bg-violet-500/[0.12]" />
                  <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/[0.12]" />
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.35] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_100%)] dark:opacity-[0.2]" />
                </div>
                {children}
              </div>
            </div>
          </div>
        </SidebarProvider>
      </div>
    </>
  )
}
