import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import { getNextAuthSecret } from './next-auth-secret'

const API_URL =
  process.env.NEXTAUTH_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

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

    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
      is_platform_admin?: boolean
    }
    return {
      ...token,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? token.refresh_token,
      access_token_expires: Date.now() + 14 * 60 * 1000,
      ...(typeof data.is_platform_admin === 'boolean' && {
        is_platform_admin: data.is_platform_admin,
      }),
      error: undefined,
    }
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

const cookieDomain = process.env.COOKIE_DOMAIN || undefined

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const res = await fetch(`${API_URL}/v1/app/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        })

        if (!res.ok) {
          if (res.status >= 500) throw new Error('Something went wrong. Please try again.')
          return null
        }

        const data = (await res.json()) as {
          user: {
            id: string
            email: string
            name: string
            role: string
            org_id: string
            org_name: string
            is_platform_admin?: boolean
          }
          access_token: string
          refresh_token: string
        }
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          org_id: data.user.org_id,
          org_name: data.user.org_name,
          is_platform_admin: data.user.is_platform_admin ?? false,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          id: user.id,
          role: user.role,
          org_id: user.org_id,
          org_name: user.org_name,
          is_platform_admin: user.is_platform_admin ?? false,
          access_token: user.access_token,
          refresh_token: user.refresh_token,
          access_token_expires: Date.now() + 14 * 60 * 1000,
        }
      }

      if (Date.now() < ((token.access_token_expires as number) ?? 0)) {
        return token
      }

      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role
        session.user.org_id = token.org_id
        session.user.org_name = token.org_name
        session.user.is_platform_admin = token.is_platform_admin === true
      }
      session.access_token = token.access_token as string
      session.error = token.error
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    /** Keep users signed in until they explicitly sign out (or refresh fails). */
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  secret: getNextAuthSecret(),
  cookies: cookieDomain
    ? {
        sessionToken: {
          name: 'next-auth.session-token',
          options: {
            domain: cookieDomain,
            path: '/',
            httpOnly: true,
            sameSite: 'lax' as const,
            secure: process.env.NODE_ENV === 'production',
          },
        },
      }
    : undefined,
}
