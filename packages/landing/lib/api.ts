import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getSession, signOut } from 'next-auth/react'
import { clearScreenshotImageCache } from '@/lib/screenshotThumbCache'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
})

type RetryConfig = InternalAxiosRequestConfig & { _authRetry?: boolean }

function getAuthorizationFromConfig(
  config: InternalAxiosRequestConfig | undefined
): string | undefined {
  if (!config?.headers) return undefined
  const h = config.headers
  const fromGet =
    typeof (h as { get?: (key: string) => unknown }).get === 'function'
      ? ((h as { get: (key: string) => unknown }).get('Authorization') ??
        (h as { get: (key: string) => unknown }).get('authorization'))
      : undefined
  if (typeof fromGet === 'string' && fromGet.length > 0) return fromGet
  const r = h as Record<string, unknown>
  const v = r.Authorization ?? r.authorization
  if (typeof v === 'string' && v.length > 0) return v
  return undefined
}

function setAuthorizationOnConfig(config: InternalAxiosRequestConfig, accessToken: string): void {
  const bearer = `Bearer ${accessToken}`
  const h = (config.headers = config.headers ?? {})
  if (typeof (h as { set?: (k: string, v: string) => void }).set === 'function') {
    ;(h as { set: (k: string, v: string) => void }).set('Authorization', bearer)
  } else {
    ;(h as Record<string, string>).Authorization = bearer
  }
}

api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    const session = await getSession()
    const token = (session as { access_token?: string } | null)?.access_token
    if (token) {
      setAuthorizationOnConfig(config, token)
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const config = err.config as RetryConfig | undefined
    const sentAuth = Boolean(getAuthorizationFromConfig(config))

    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      sentAuth &&
      config &&
      !config._authRetry
    ) {
      // Access token may be stale (dev HMR, clock skew vs backend). Refresh session once before signing out.
      config._authRetry = true
      const session = await getSession()
      const s = session as { access_token?: string; error?: string } | null
      if (s?.access_token && !s.error) {
        setAuthorizationOnConfig(config, s.access_token)
        return api.request(config)
      }
    }

    if (err.response?.status === 401 && typeof window !== 'undefined' && sentAuth) {
      // Only sign out when a token was sent but rejected — not when getSession() lagged on
      // hard refresh and the request went out without Authorization (would wrongly clear cookie).
      // Clear NextAuth cookies so a user with backend 401 does not bounce:
      // login page auto-redirects when "authenticated", which caused /myhome ↔ /login loops.
      await clearScreenshotImageCache().catch(() => {})
      await signOut({ redirect: false })
      const path = window.location.pathname || '/myhome'
      const callbackUrl = encodeURIComponent(path)
      window.location.href = `/login?callbackUrl=${callbackUrl}`
    }
    return Promise.reject(err)
  }
)
