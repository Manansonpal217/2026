import { addKeyboardEvent, addMouseClick, addMouseMovement } from './windowBuffer.js'
import { markIntervalActive } from './intervalTracker.js'

let prevMouseX = 0
let prevMouseY = 0

let onActivityCallback: (() => void) | null = null

let monitor: (typeof import('uiohook-napi'))['uIOhook'] | null = null

/**
 * Load cross-platform input monitor (uiohook-napi).
 * Works on Windows, macOS, and Linux.
 */
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { uIOhook } = require('uiohook-napi')
  monitor = uIOhook
} catch (err) {
  console.warn('[inputMonitor] Input monitor not available — activity tracking disabled:', err)
}

export function isInputMonitorAvailable(): boolean {
  return monitor !== null
}

export function setOnActivityCallback(cb: (() => void) | null): void {
  onActivityCallback = cb
}

export function startInputMonitor(): void {
  if (!monitor) return

  // Keyboard: any key press
  monitor.on('keydown', () => {
    markIntervalActive()
    addKeyboardEvent()
    onActivityCallback?.()
  })

  // Mouse: clicks (mousedown fires for left, right, middle)
  monitor.on('mousedown', () => {
    markIntervalActive()
    addMouseClick()
    onActivityCallback?.()
  })

  // Mouse: movement (with distance threshold to filter jitter)
  monitor.on('mousemove', (event: { x: number; y: number }) => {
    const { x = 0, y = 0 } = event
    if (prevMouseX !== 0 || prevMouseY !== 0) {
      const dx = x - prevMouseX
      const dy = y - prevMouseY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 5) {
        markIntervalActive()
        addMouseMovement(Math.round(dist))
      }
    }
    prevMouseX = x
    prevMouseY = y
    onActivityCallback?.()
  })

  monitor.start()
}

export function stopInputMonitor(): void {
  if (!monitor) return
  monitor.stop()
  prevMouseX = 0
  prevMouseY = 0
  onActivityCallback = null
}
