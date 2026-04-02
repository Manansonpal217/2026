import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SessionRoot } from '@/components/SessionRoot'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
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
        className={`${inter.variable} relative min-h-screen overflow-x-hidden font-sans antialiased`}
      >
        <ThemeProvider>
          <SessionRoot>
            <div className="fixed inset-0 -z-10 bg-background" aria-hidden />
            <div className="gradient-mesh fixed inset-0 -z-10" aria-hidden />
            <div
              className="fixed inset-0 -z-10 bg-grid-pattern opacity-[0.65] dark:opacity-75"
              aria-hidden
            />
            <div
              className="fixed -top-40 -right-40 -z-10 h-80 w-80 animate-float rounded-full bg-primary/12 blur-3xl dark:bg-primary/10"
              aria-hidden
            />
            <div
              className="fixed -bottom-40 -left-40 -z-10 h-80 w-80 animate-float-slow rounded-full bg-primary/10 blur-3xl dark:bg-primary/10"
              aria-hidden
            />
            {children}
          </SessionRoot>
        </ThemeProvider>
      </body>
    </html>
  )
}
