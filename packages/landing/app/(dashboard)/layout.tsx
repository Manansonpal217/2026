import { AppShellSidebar } from '@/components/AppShellSidebar'
import { Navbar } from '@/components/Navbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-[3.75rem]">
        <div className="flex min-h-[calc(100vh-3.75rem)] flex-col md:flex-row">
          <AppShellSidebar />
          <div className="flex min-w-0 flex-1 flex-col border-border md:border-l">{children}</div>
        </div>
      </div>
    </>
  )
}
