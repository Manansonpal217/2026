import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ADMIN_ORG_DIRECTORY_HREF, mayAccessPlatformUserAdmin } from '@/lib/admin-gate'

/** Platform-only: org owners use org directory, not cross-tenant user admin. */
export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!mayAccessPlatformUserAdmin(session?.user)) {
    redirect(ADMIN_ORG_DIRECTORY_HREF)
  }
  return <>{children}</>
}
