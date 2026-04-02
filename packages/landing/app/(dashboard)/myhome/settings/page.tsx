import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canShowConfigurationSidebar, getConfigurationEntryHref } from '@/lib/roles'

/** Legacy path: send users to their primary configuration screen. */
export default async function ConfigurationLegacyRedirectPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  const isPlatformAdmin = session?.user?.is_platform_admin === true

  if (!canShowConfigurationSidebar(role, isPlatformAdmin)) {
    redirect('/myhome')
  }

  redirect(getConfigurationEntryHref(role, isPlatformAdmin))
}
