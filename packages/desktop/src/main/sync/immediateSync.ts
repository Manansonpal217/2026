import { triggerImmediateSync } from './scheduler.js'

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 800

/** Debounced full sync after a new local screenshot (avoids hammering API on burst captures). */
export function requestSyncSoonAfterCapture(): void {
  if (debounceTimer != null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void triggerImmediateSync()
  }, DEBOUNCE_MS)
}
