import 'next-auth'

declare module 'next-auth' {
  interface User {
    id?: string
    role?: string
    org_id?: string
    org_name?: string
  }

  interface Session {
    user: User
    access_token?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    org_id?: string
    org_name?: string
    access_token?: string
    refresh_token?: string
  }
}
