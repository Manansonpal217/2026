import type { IpcMain } from 'electron'
import { startOAuthFlow, disconnect, isConnected } from './auth.js'
import { getMyIssues, logWork } from './api.js'

export function registerJiraHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('jira:connect', async () => {
    const result = await startOAuthFlow()
    return result
  })

  ipcMain.handle('jira:disconnect', async () => {
    await disconnect(false)
    return { ok: true }
  })

  ipcMain.handle('jira:is-connected', async () => {
    return isConnected()
  })

  ipcMain.handle('jira:get-issues', async () => {
    return getMyIssues()
  })

  ipcMain.handle(
    'jira:log-work',
    async (_event, issueKey: string, timeSpentSeconds: number, description: string) => {
      return logWork(issueKey, timeSpentSeconds, description)
    }
  )
}
