import type { IpcMain } from 'electron'
import * as keytar from 'keytar'
import log from 'electron-log'
import { startAsanaOAuthFlow, disconnectAsana, isAsanaConnected } from './auth.js'

const SERVICE = 'trackysnc'
const ASANA_ACCESS = 'asana_access_token'
const ASANA_REFRESH = 'asana_refresh_token'
const ASANA_TOKEN_URL = 'https://app.asana.com/-/oauth_token'

async function getAsanaAccessToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE, ASANA_ACCESS)
}

async function refreshAsanaToken(): Promise<string | null> {
  const refreshToken = await keytar.getPassword(SERVICE, ASANA_REFRESH)
  if (!refreshToken) return null

  const clientId = process.env.ASANA_CLIENT_ID
  const clientSecret = process.env.ASANA_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch(ASANA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
    }
    await keytar.setPassword(SERVICE, ASANA_ACCESS, data.access_token)
    if (data.refresh_token) {
      await keytar.setPassword(SERVICE, ASANA_REFRESH, data.refresh_token)
    }
    return data.access_token
  } catch (err) {
    log.error('[asana/ipcHandlers] Token refresh failed:', err)
    return null
  }
}

async function getValidAsanaToken(): Promise<string | null> {
  const token = await getAsanaAccessToken()
  if (!token) return null

  // Probe the token with a lightweight /users/me call; refresh on 401
  try {
    const probe = await fetch('https://app.asana.com/api/1.0/users/me?opt_fields=gid', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (probe.status === 401) {
      log.info('[asana/ipcHandlers] Access token expired, attempting refresh')
      return refreshAsanaToken()
    }
  } catch {
    // Network error — return the existing token and let the caller handle it
  }
  return token
}

export function registerAsanaHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('asana:connect', async () => {
    return startAsanaOAuthFlow()
  })

  ipcMain.handle('asana:disconnect', async () => {
    await disconnectAsana(true)
    return { ok: true }
  })

  ipcMain.handle('asana:is-connected', async () => {
    return isAsanaConnected()
  })

  ipcMain.handle(
    'asana:log-work',
    async (
      _,
      { taskId, durationSec, comment }: { taskId: string; durationSec: number; comment: string }
    ) => {
      const accessToken = await getValidAsanaToken()
      if (!accessToken) {
        throw new Error('Not connected to Asana')
      }

      const h = Math.floor(durationSec / 3600)
      const m = Math.floor((durationSec % 3600) / 60)
      const s = Math.floor(durationSec % 60)
      const durationFormatted = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`

      const storyText = `Logged ${durationFormatted}: ${comment} [via TrackSync]`

      const res = await fetch(`https://app.asana.com/api/1.0/tasks/${taskId}/stories`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { text: storyText } }),
      })

      if (!res.ok) {
        const text = await res.text()
        log.error('[asana/ipcHandlers] log-work failed:', res.status, text)
        throw new Error(`Asana log failed: ${res.status}`)
      }

      return res.json()
    }
  )
}
