import { Navbar } from '@/components/Navbar'

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="pt-[3.75rem]">{children}</div>
    </>
  )
}
