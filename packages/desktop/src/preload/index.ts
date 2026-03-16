import { contextBridge, ipcRenderer } from 'electron'

const listenerMap = new Map<string, Map<(...args: unknown[]) => void, (...args: unknown[]) => void>>()

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const wrapper = (_: unknown, ...args: unknown[]) => listener(...args)
      if (!listenerMap.has(channel)) listenerMap.set(channel, new Map())
      listenerMap.get(channel)!.set(listener, wrapper)
      ipcRenderer.on(channel, wrapper)
    },
    off: (channel: string, listener: (...args: unknown[]) => void) => {
      const wrappers = listenerMap.get(channel)
      const wrapper = wrappers?.get(listener)
      if (wrapper && wrappers) {
        ipcRenderer.removeListener(channel, wrapper)
        wrappers.delete(listener)
      }
    },
  },
})
