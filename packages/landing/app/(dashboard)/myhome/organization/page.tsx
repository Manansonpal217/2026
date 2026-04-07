import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isManagerOrAbove, isOrgAdminRole } from '@/lib/roles'

export default async function OrganizationIndexPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  if (!isManagerOrAbove(role)) {
    redirect('/myhome')
  }
  if (isOrgAdminRole(role)) {
    redirect('/myhome/organization/settings')
  }
  redirect('/myhome/organization/people')
}
