import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-12 lg:grid-cols-4">
          <div>
            <span className="text-lg font-semibold text-white">TrackSync</span>
            <p className="mt-2 text-sm text-muted">Work intelligence for modern teams.</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">Product</h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-muted transition-colors hover:text-white"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/#features"
                  className="text-sm text-muted transition-colors hover:text-white"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-sm text-muted transition-colors hover:text-white">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">Company</h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted transition-colors hover:text-white"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-muted transition-colors hover:text-white"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">Legal</h4>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted transition-colors hover:text-white"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted transition-colors hover:text-white"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-white/5 pt-8">
          <span className="text-sm text-muted">© {new Date().getFullYear()} TrackSync</span>
        </div>
      </div>
    </footer>
  )
}
