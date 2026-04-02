import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isOrgAdminRole } from '@/lib/roles'

export default async function OrgWorkspaceSettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!isOrgAdminRole(session?.user?.role)) {
    redirect('/myhome')
  }
  return <>{children}</>
}
