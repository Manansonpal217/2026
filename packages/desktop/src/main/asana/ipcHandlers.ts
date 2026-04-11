import type { IpcMain } from 'electron'
import * as keytar from 'keytar'
import log from 'electron-log'
import { startAsanaOAuthFlow, disconnectAsana, isAsanaConnected } from './auth.js'

const SERVICE = 'trackysnc'
const ASANA_ACCESS = 'asana_access_token'

async function getAsanaAccessToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE, ASANA_ACCESS)
}

export function registerAsanaHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('asana:connect', async () => {
    return startAsanaOAuthFlow()
  })

  ipcMain.handle('asana:disconnect', async () => {
    await disconnectAsana(false)
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
      const accessToken = await getAsanaAccessToken()
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
