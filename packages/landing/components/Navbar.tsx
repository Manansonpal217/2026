'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const navLinks = (
    <>
      <Link
        href="/pricing"
        className="text-sm text-muted transition-colors hover:text-white"
        onClick={() => setMobileOpen(false)}
      >
        Pricing
      </Link>
      <Link
        href="/about"
        className="text-sm text-muted transition-colors hover:text-white"
        onClick={() => setMobileOpen(false)}
      >
        About
      </Link>
      <Link
        href="/contact"
        className="text-sm text-muted transition-colors hover:text-white"
        onClick={() => setMobileOpen(false)}
      >
        Contact
      </Link>
      <Link
        href="/contact"
        className="rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
        onClick={() => setMobileOpen(false)}
      >
        Request demo
      </Link>
    </>
  )

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? 'border-white/10 bg-background/90 backdrop-blur-xl'
          : 'border-white/5 bg-background/50 backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold text-white transition-opacity hover:opacity-90 sm:text-xl"
        >
          TrackSync
        </Link>
        <nav className="hidden items-center gap-8 sm:flex">{navLinks}</nav>
        <button
          type="button"
          className="sm:hidden rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="sm:hidden absolute inset-x-0 top-14 border-t border-white/5 bg-background/95 backdrop-blur-xl">
          <nav className="flex flex-col gap-4 p-6">{navLinks}</nav>
        </div>
      )}
    </header>
  )
}
