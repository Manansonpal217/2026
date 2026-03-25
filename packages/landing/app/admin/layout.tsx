import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { Navbar } from '@/components/Navbar'
import { authOptions } from '@/lib/auth'
import { AdminSubNav } from './sub-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.is_platform_admin) {
    redirect('/myhome')
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pt-[3.75rem]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage organizations and view users across tenants.
            </p>
          </header>
          <AdminSubNav />
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </>
  )
}
