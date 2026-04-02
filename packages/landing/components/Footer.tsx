import Link from 'next/link'
import { Separator } from '@/components/ui/separator'

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border/80 bg-background/50 py-14 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 gradient-mesh opacity-[0.2]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 sm:grid-cols-2 sm:gap-14 lg:grid-cols-4">
          <div>
            <span className="text-lg font-semibold tracking-tight text-foreground">TrackSync</span>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Work intelligence for modern teams.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-tight text-foreground">Product</h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/#features"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-tight text-foreground">Company</h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-tight text-foreground">Legal</h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <Separator className="my-12 bg-border/80" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground" suppressHydrationWarning>
            © {new Date().getFullYear()} TrackSync
          </span>
        </div>
      </div>
    </footer>
  )
}
