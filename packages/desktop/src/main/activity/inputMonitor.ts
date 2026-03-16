import { addKeyboardEvent, addMouseClick, addMouseMovement } from './windowBuffer.js'

let prevMouseX = 0
let prevMouseY = 0

type InputMonitor = {
  on: (event: string, callback: (...args: unknown[]) => void) => void
  startMonitoring?: () => void
  stopMonitoring?: () => void
  start?: (enableLogger?: boolean) => void
  stop?: () => void
  unload?: () => void
}

let monitor: InputMonitor | null = null

/**
 * Load platform-specific input monitor. macOS uses iohook-macos (has prebuilds for arm64).
 * Others use iohook (may require build from source).
 */
try {
  if (process.platform === 'darwin') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    monitor = require('iohook-macos')
  }
  // Windows/Linux: would need iohook or similar — not installed by default
} catch (err) {
  console.warn('[inputMonitor] Input monitor not available — activity tracking disabled:', err)
}

export function isInputMonitorAvailable(): boolean {
  return monitor !== null
}

export function startInputMonitor(): void {
  if (!monitor) return

  if (process.platform === 'darwin') {
    // iohook-macos API: keyDown, leftMouseDown, mouseMoved
    monitor.on('keyDown', () => addKeyboardEvent())
    monitor.on('leftMouseDown', () => addMouseClick())
    monitor.on('rightMouseDown', () => addMouseClick())
    monitor.on('mouseMoved', (event: unknown) => {
      const { x = 0, y = 0 } = (event as { x?: number; y?: number }) ?? {}
      if (prevMouseX !== 0 || prevMouseY !== 0) {
        const dx = x - prevMouseX
        const dy = y - prevMouseY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 5) addMouseMovement(Math.round(dist))
      }
      prevMouseX = x
      prevMouseY = y
    })
    monitor.startMonitoring?.()
  } else {
    // iohook API: keydown, mouseclick, mousemove
    monitor.on('keydown', () => addKeyboardEvent())
    monitor.on('mouseclick', () => addMouseClick())
    monitor.on('mousemove', (event: unknown) => {
      const { x, y } = (event as { x: number; y: number }) ?? { x: 0, y: 0 }
      if (prevMouseX !== 0 || prevMouseY !== 0) {
        const dx = x - prevMouseX
        const dy = y - prevMouseY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 5) addMouseMovement(Math.round(dist))
      }
      prevMouseX = x
      prevMouseY = y
    })
    monitor.start?.(false)
  }
}

export function stopInputMonitor(): void {
  if (!monitor) return
  if (process.platform === 'darwin') {
    monitor.stopMonitoring?.()
  } else {
    monitor.stop?.()
    monitor.unload?.()
  }
  prevMouseX = 0
  prevMouseY = 0
}
