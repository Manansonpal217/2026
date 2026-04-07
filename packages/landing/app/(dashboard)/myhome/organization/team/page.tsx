import { redirect } from 'next/navigation'

export default function OrganizationTeamRedirectPage() {
  redirect('/myhome/organization/people?tab=teams')
}
