import { redirect } from 'next/navigation'

/** Legacy URL; audit log was removed from organization admin. */
export default function OrganizationAuditRedirectPage() {
  redirect('/myhome/organization/settings')
}
