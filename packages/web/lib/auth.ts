import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'

const API_URL = process.env.NEXTAUTH_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${API_URL}/v1/app/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token.refresh_token }),
    })

    if (!res.ok) {
      return { ...token, error: 'RefreshAccessTokenError' }
    }

    const data = await res.json()
    return {
      ...token,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? token.refresh_token,
      access_token_expires: Date.now() + 14 * 60 * 1000, // 14 minutes
      error: undefined,
    }
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        org_slug: { label: 'Organization', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const res = await fetch(`${API_URL}/v1/app/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
            org_slug: credentials.org_slug || undefined,
          }),
        })

        if (!res.ok) return null

        const data = await res.json()
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          org_id: data.user.org_id,
          org_name: data.user.org_name,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        return {
          ...token,
          id: user.id,
          role: (user as { role?: string }).role,
          org_id: (user as { org_id?: string }).org_id,
          org_name: (user as { org_name?: string }).org_name,
          access_token: (user as { access_token?: string }).access_token,
          refresh_token: (user as { refresh_token?: string }).refresh_token,
          access_token_expires: Date.now() + 14 * 60 * 1000,
        }
      }

      // Access token still valid
      if (Date.now() < (token.access_token_expires as number ?? 0)) {
        return token
      }

      // Access token expired — try to refresh
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string
        ;(session.user as { role?: string }).role = token.role as string
        ;(session.user as { org_id?: string }).org_id = token.org_id as string
        ;(session.user as { org_name?: string }).org_name = token.org_name as string
      }
      ;(session as { access_token?: string }).access_token = token.access_token as string
      ;(session as { error?: string }).error = token.error as string | undefined
      return session
    },
  },
  pages: {
    signIn: '/auth/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
}
