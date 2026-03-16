import { powerMonitor } from 'electron'
import { getActiveSession } from '../timer/store.js'
import { setOnActivityCallback } from '../activity/inputMonitor.js'

const INACTIVITY_CHECK_INTERVAL_MS = 10_000 // 10 seconds (matches intervalTracker interval)

export type StopReason = 'inactivity' | 'sleep' | 'screen_locked'

export interface IdleConfig {
  idleTimeoutMs: number
  idleDetectionEnabled: boolean
}

export interface IdleCallbacks {
  onAutoStop: (reason: StopReason) => void
  onActivityResume: () => void
}

let checkIntervalId: ReturnType<typeof setInterval> | null = null
let lastActivityAt = 0
let config: IdleConfig = { idleTimeoutMs: 5 * 60 * 1000, idleDetectionEnabled: true }
let callbacks: IdleCallbacks | null = null
let powerMonitorHandlersAttached = false

function activityHandler(): void {
  lastActivityAt = Date.now()
  if (callbacks?.onActivityResume) {
    callbacks.onActivityResume()
  }
}

function checkInactivity(): void {
  if (!config.idleDetectionEnabled) return
  const session = getActiveSession()
  if (!session) return
  const now = Date.now()
  if (now - lastActivityAt >= config.idleTimeoutMs) {
    console.log('[idleManager] Inactivity detected, triggering auto-stop')
    callbacks?.onAutoStop('inactivity')
  }
}

function onSuspend(): void {
  const session = getActiveSession()
  if (session) {
    console.log('[idleManager] System suspend detected, triggering auto-stop')
    callbacks?.onAutoStop('sleep')
  }
}

function onLockScreen(): void {
  const session = getActiveSession()
  if (session) {
    console.log('[idleManager] Lock screen detected, triggering auto-stop')
    callbacks?.onAutoStop('screen_locked')
  }
}

function onResume(): void {
  callbacks?.onActivityResume()
}

function onUnlockScreen(): void {
  callbacks?.onActivityResume()
}

export function startIdleManager(cfg: IdleConfig, cbs: IdleCallbacks): void {
  config = cfg
  callbacks = cbs
  lastActivityAt = Date.now()

  setOnActivityCallback(activityHandler)

  if (checkIntervalId) clearInterval(checkIntervalId)
  checkIntervalId = setInterval(checkInactivity, INACTIVITY_CHECK_INTERVAL_MS)

  if (!powerMonitorHandlersAttached) {
    powerMonitor.on('suspend', onSuspend)
    powerMonitor.on('lock-screen', onLockScreen)
    powerMonitor.on('resume', onResume)
    powerMonitor.on('unlock-screen', onUnlockScreen)
    powerMonitorHandlersAttached = true
  }
}

export function stopIdleManager(): void {
  setOnActivityCallback(null)
  if (checkIntervalId) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
  }
  if (powerMonitorHandlersAttached) {
    powerMonitor.off('suspend', onSuspend)
    powerMonitor.off('lock-screen', onLockScreen)
    powerMonitor.off('resume', onResume)
    powerMonitor.off('unlock-screen', onUnlockScreen)
    powerMonitorHandlersAttached = false
  }
  callbacks = null
}
