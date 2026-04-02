import type { IpcMain } from 'electron'
import { startAsanaOAuthFlow, disconnectAsana, isAsanaConnected } from './auth.js'

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
}
