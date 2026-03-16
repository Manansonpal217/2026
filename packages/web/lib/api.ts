import axios from 'axios'
import { getSession } from 'next-auth/react'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
})

// Attach Bearer token from next-auth session on every request (client-side only)
api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    const session = await getSession()
    const token = (session as { access_token?: string } | null)?.access_token
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// On 401, attempt a page reload to trigger next-auth session refresh
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/auth/login'
    }
    return Promise.reject(err)
  },
)
