import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { IntegrationsClient } from './client'
import { authOptions } from '@/lib/auth'

export const metadata = { title: 'Integrations — TrackSync' }

export default async function IntegrationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/login')
  return <IntegrationsClient />
}
