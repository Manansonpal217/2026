import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { AppShellSidebar } from '@/components/AppShellSidebar'
import { Navbar } from '@/components/Navbar'
import { authOptions } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  const isOrgSuperAdmin = role === 'super_admin'
  const isPlatformAdmin = session?.user?.is_platform_admin === true
  if (!isPlatformAdmin && !isOrgSuperAdmin) {
    redirect('/myhome')
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-[3.75rem]">
        <div className="flex min-h-[calc(100vh-3.75rem)] flex-col md:flex-row">
          <AppShellSidebar />
          <div className="flex min-w-0 flex-1 flex-col border-border md:border-l">
            <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </div>
        </div>
      </div>
    </>
  )
}
