import type { DefaultSession } from 'next-auth'
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    id?: string
    role?: string
    org_id?: string
    org_name?: string
    is_platform_admin?: boolean
    access_token?: string
    refresh_token?: string
  }

  interface Session {
    user: User & DefaultSession['user']
    access_token?: string
    error?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    org_id?: string
    org_name?: string
    is_platform_admin?: boolean
    access_token?: string
    refresh_token?: string
    access_token_expires?: number
    error?: string
  }
}
