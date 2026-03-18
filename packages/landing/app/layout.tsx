import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import './globals.css'
import { Navbar } from '../components/Navbar'
import { Footer } from '../components/Footer'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TrackSync — Work Intelligence Platform',
  description:
    'Task-based time tracking with Jira, Asana & Atlassian. Automatic daily standups, screenshots, and team insights.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${outfit.variable} relative min-h-screen overflow-x-hidden font-sans antialiased`}
      >
        {/* Hero-style background across entire site */}
        <div className="fixed inset-0 -z-10 bg-background" aria-hidden />
        <div className="gradient-mesh fixed inset-0 -z-10" aria-hidden />
        <div className="fixed inset-0 -z-10 bg-grid-pattern opacity-80" aria-hidden />
        <div
          className="fixed -top-40 -right-40 -z-10 h-80 w-80 animate-float rounded-full bg-primary/15 blur-3xl"
          aria-hidden
        />
        <div
          className="fixed -bottom-40 -left-40 -z-10 h-80 w-80 animate-float-slow rounded-full bg-accent/15 blur-3xl"
          aria-hidden
        />
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  )
}
