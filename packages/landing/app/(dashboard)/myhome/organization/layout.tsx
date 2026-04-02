import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Building2 } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { isManagerOrAbove, isOrgAdminRole, isOrgSuperAdmin } from '@/lib/roles'

export default async function OrganizationLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  if (!isManagerOrAbove(role)) {
    redirect('/myhome')
  }

  const isOrgAdmin = isOrgAdminRole(role)
  const isSuperAdmin = isOrgSuperAdmin(role)

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
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
                {isOrgAdmin ? 'Organization admin' : 'Users'}
              </h1>
              {session?.user?.org_name ? (
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {session.user.org_name}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isOrgAdmin
                ? 'Workspace configuration and users for your organization.'
                : 'Manage people and roles in your organization.'}
            </p>
            {isSuperAdmin ? (
              <p className="mt-3 max-w-2xl rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                This page only lists people in your organization. For every tenant, open{' '}
                <Link
                  href="/admin/users"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  All users
                </Link>{' '}
                under Configuration and select an organization.
              </p>
            ) : null}
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
