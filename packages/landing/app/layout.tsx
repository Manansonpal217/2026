import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import { SessionRoot } from '@/components/SessionRoot'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

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
    'Task-based time tracking that connects to the tools your team already uses. Automatic daily standups, screenshots, and team insights.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${outfit.variable} relative min-h-screen overflow-x-hidden font-sans antialiased`}
      >
        <ThemeProvider>
          <SessionRoot>
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
            {children}
          </SessionRoot>
        </ThemeProvider>
      </body>
    </html>
  )
}
