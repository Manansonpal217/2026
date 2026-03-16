import dynamic from 'next/dynamic'
import { Topbar } from '@/components/topbar'

// Sidebar uses useSession + usePathname which differ between server and client,
// so we disable SSR to avoid hydration mismatches.
const Sidebar = dynamic(
  () => import('@/components/sidebar').then((m) => ({ default: m.Sidebar })),
  { ssr: false },
)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Topbar />
      <main className="ml-60 pt-14 min-h-screen">
        <div className="h-full p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
