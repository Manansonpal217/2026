import { setActiveApp } from './windowBuffer.js'

const POLL_INTERVAL_MS = 5_000

let pollTimer: ReturnType<typeof setInterval> | null = null

export function startActiveWindowPolling(): void {
  if (pollTimer !== null) return

  pollTimer = setInterval(async () => {
    try {
      const getWindows = await import('get-windows')
      const win = await getWindows.activeWindow()
      if (win?.owner?.name) {
        setActiveApp(win.owner.name)
      }
    } catch {
      // Non-fatal: permissions may not be granted
    }
  }, POLL_INTERVAL_MS)
}

export function stopActiveWindowPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
