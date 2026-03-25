/// <reference types="vite/client" />

declare module '*.json' {
  const value: unknown
  export default value
}

interface ElectronAPI {
  platform: string
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, listener: (...args: unknown[]) => void) => void
    off: (channel: string, listener: (...args: unknown[]) => void) => void
  }
}

interface TrackysncAPI {
  connectJira: () => Promise<{ success: boolean; error?: string }>
  disconnectJira: () => Promise<{ ok: boolean }>
  isConnected: () => Promise<boolean>
  getIssues: () => Promise<
    Array<{
      id: string
      key: string
      summary: string
      status: string
      priority: string | null
      project: string
      issueType: string
      url: string
    }>
  >
  logWork: (key: string, secs: number, desc: string) => Promise<unknown>
}

declare global {
  interface Window {
    electron?: ElectronAPI
    trackysnc?: TrackysncAPI
  }
}

export {}
