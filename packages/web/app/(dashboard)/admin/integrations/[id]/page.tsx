import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { IntegrationDetailClient } from './client'

export const metadata = { title: 'Integration Detail — TrackSync' }

export default async function IntegrationDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/login')
  return <IntegrationDetailClient id={params.id} />
}
