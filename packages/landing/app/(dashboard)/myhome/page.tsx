'use client'

import { useSession } from 'next-auth/react'
import { TeamActivityPanel } from '@/components/TeamActivityPanel'
import { PersonalActivityPanel } from '@/components/PersonalActivityPanel'
import { isManagerOrAbove } from '@/lib/roles'

export default function MyHomePage() {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const isManager = isManagerOrAbove(role)

  if (!isManager) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PersonalActivityPanel />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <TeamActivityPanel />
    </main>
  )
}
