import type { IpcMain, BrowserWindow } from 'electron'
import { decodeJwt } from 'jose'
import { storeTokens, loadTokens, clearTokens } from './keychain.js'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

export async function ensureValidSession(win?: BrowserWindow): Promise<string | null> {
  const tokens = await loadTokens()
  if (!tokens) return null

  try {
    const payload = decodeJwt(tokens.accessToken)
    const exp = (payload.exp ?? 0) * 1000
    if (exp - Date.now() > 60 * 1000) return tokens.accessToken
  } catch {
    await clearTokens()
    return null
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/v1/app/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    })
  } catch (err) {
    // Network error (e.g. backend not ready yet on dev restart) — keep tokens, return null
    // Caller can retry; tokens remain in keychain for next attempt
    return null
  }

  if (!res.ok) {
    // Only clear tokens on auth failures (401/403); keep them on 5xx/server errors
    if (res.status === 401 || res.status === 403) {
      await clearTokens()
      win?.webContents.send('auth:session-expired')
      return null
    }
    throw new Error('Server error. Please try again in a moment.')
  }

  const data = await res.json()
  await storeTokens(data.access_token, data.refresh_token)
  return data.access_token
}

export function authHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  onLogout?: () => void
) {
  ipcMain.handle(
    'auth:login',
    async (
      _,
      { email, password, org_slug }: { email: string; password: string; org_slug?: string }
    ) => {
      const res = await fetch(`${API_URL}/v1/app/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, org_slug }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string }
        // Auth failures (401/402/403): return user-friendly message — never "Server error"
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          return { error: err.message || 'Invalid email or password' }
        }
        // 5xx or other: generic message — never expose internal server details
        throw new Error('Something went wrong. Please try again.')
      }

      const data = await res.json()

      if (data.mfa_required) {
        return { mfa_required: true, mfa_token: data.mfa_token }
      }

      await storeTokens(data.access_token, data.refresh_token)
      return { user: data.user, org_settings: data.org_settings }
    }
  )

  ipcMain.handle(
    'auth:mfa-verify',
    async (_, { mfa_token, totp_code }: { mfa_token: string; totp_code: string }) => {
      const res = await fetch(`${API_URL}/v1/app/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_token, totp_code }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string }
        // Auth failures (401/402/403): return user-friendly message — never "Server error"
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          return { error: err.message || 'Invalid code' }
        }
        // 5xx or other: generic message — never expose internal server details
        throw new Error('Something went wrong. Please try again.')
      }

      const data = await res.json()
      await storeTokens(data.access_token, data.refresh_token)
      return { user: data.user }
    }
  )

  ipcMain.handle('auth:logout', async () => {
    const tokens = await loadTokens()
    if (tokens) {
      await fetch(`${API_URL}/v1/app/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      }).catch(() => {})
    }
    await clearTokens()
    onLogout?.()
  })

  ipcMain.handle('auth:get-current-user', async () => {
    const token = await ensureValidSession(getMainWindow() ?? undefined)
    if (!token) return null

    try {
      const payload = decodeJwt(token) as { sub?: string; org_id?: string; role?: string }
      return {
        id: payload.sub,
        org_id: payload.org_id,
        role: payload.role,
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('auth:ensure-session', async () => {
    return ensureValidSession(getMainWindow() ?? undefined)
  })
}
