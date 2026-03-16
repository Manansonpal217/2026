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

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

export {}
