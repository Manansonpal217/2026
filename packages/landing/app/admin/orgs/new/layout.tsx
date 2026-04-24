import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ADMIN_ORG_DIRECTORY_HREF, mayCreateOrganizationInAdmin } from '@/lib/admin-gate'

export default async function AdminNewOrgLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!mayCreateOrganizationInAdmin(session?.user)) {
    redirect(ADMIN_ORG_DIRECTORY_HREF)
  }
  return <>{children}</>
}
