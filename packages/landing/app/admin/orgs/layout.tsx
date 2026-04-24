/**
 * Org directory under `/admin` — access is enforced by `app/admin/layout.tsx`.
 * Do not add redirects here that send non–platform-admins to other `/admin/*` children,
 * or you can recreate a redirect loop with sibling layouts (e.g. users ↔ orgs).
 */
export default function AdminOrgsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
