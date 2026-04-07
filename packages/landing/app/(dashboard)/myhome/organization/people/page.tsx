import { Suspense } from 'react'
import { OrganizationPeopleClient } from './organization-people-client'

export default function OrganizationPeoplePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-10 w-72 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-72 animate-pulse rounded-xl bg-muted/40" />
        </div>
      }
    >
      <OrganizationPeopleClient />
    </Suspense>
  )
}
