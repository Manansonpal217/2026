import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Building2 } from 'lucide-react'
import { mayAccessPlatformUserAdmin } from '@/lib/admin-gate'
import { authOptions } from '@/lib/auth'
import { isManagerOrAbove, isOrgAdminRole } from '@/lib/roles'

export default async function OrganizationLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  if (mayAccessPlatformUserAdmin(session?.user)) {
    redirect('/admin/dashboard')
  }
  if (!isManagerOrAbove(role)) {
    redirect('/myhome')
  }

  const isOrgAdmin = isOrgAdminRole(role)

  return (
    <div className="relative isolate mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-muted/45" />
        <div className="absolute -right-24 top-10 h-[28rem] w-[28rem] rounded-full bg-violet-500/[0.09] blur-3xl dark:bg-violet-500/[0.12]" />
        <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/[0.12]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:56px_56px] opacity-[0.35] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_100%)] dark:opacity-[0.2]" />
      </div>
      <header className="mb-6 border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Link href="/myhome" className="hover:text-foreground">
            Home
          </Link>
          <span aria-hidden> · </span>
          Organization
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-primary/10 text-primary shadow-sm">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isOrgAdmin ? 'Organization admin' : 'People'}
              </h1>
              {session?.user?.org_name ? (
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {session.user.org_name}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isOrgAdmin
                ? 'Workspace settings, people, and teams for your organization.'
                : 'View and manage people and roles in your organization.'}
            </p>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
