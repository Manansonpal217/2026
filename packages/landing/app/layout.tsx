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
  description: 'Time tracking, screenshots, and team insights. Understand how your team works.',
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
        {/* Consistent background across all pages */}
        <div className="fixed inset-0 -z-10 bg-background" aria-hidden />
        <div className="fixed inset-0 -z-10 bg-grid-pattern opacity-80" aria-hidden />
        <div
          className="fixed inset-0 -z-10 bg-gradient-to-b from-primary/[0.06] via-transparent to-transparent"
          aria-hidden
        />
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  )
}
