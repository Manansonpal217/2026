'use client'

import { useSession } from 'next-auth/react'
import { AppShellSidebar } from '@/components/AppShellSidebar'
import { Navbar } from '@/components/Navbar'
import { isManagerOrAbove } from '@/lib/roles'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const showSidebar = isManagerOrAbove(role)

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-[3.75rem]">
        <div className="flex min-h-[calc(100vh-3.75rem)] flex-col md:flex-row">
          {showSidebar && <AppShellSidebar />}
          <div className="flex min-w-0 flex-1 flex-col border-border md:border-l">{children}</div>
        </div>
      </div>
    </>
  )
}
