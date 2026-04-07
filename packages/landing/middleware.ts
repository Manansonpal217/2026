import { NextResponse } from 'next/server'
import { withAuth } from 'next-auth/middleware'
import { getNextAuthSecret } from './lib/next-auth-secret'

export default withAuth(
  function middleware(req) {
    if (req.nextUrl.pathname === '/' && req.nextauth.token) {
      return NextResponse.redirect(new URL('/myhome', req.url))
    }

    if (
      req.nextUrl.pathname.startsWith('/admin') &&
      req.nextauth.token?.is_platform_admin !== true
    ) {
      return NextResponse.redirect(new URL('/myhome', req.url))
    }
    return NextResponse.next()
  },
  {
    secret: getNextAuthSecret(),
    pages: { signIn: '/login' },
    callbacks: {
      authorized: ({ req, token }) => {
        if (req.nextUrl.pathname === '/') return true
        return !!token
      },
    },
  }
)

export const config = {
  matcher: ['/', '/myhome/:path*', '/admin/:path*'],
}
