import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface UserPrefs {
  /** OS notification when a periodic screenshot is saved. Default false. */
  notifyOnScreenshotCapture: boolean
  /** When org allows blur, request server-side blur for every captured screenshot upload. */
  requestBlurForAllCaptures: boolean
  /** One-shot: next capture only requests blur (cleared after that capture). */
  requestBlurNextCaptureOnce: boolean
}

const DEFAULT_PREFS: UserPrefs = {
  notifyOnScreenshotCapture: false,
  requestBlurForAllCaptures: false,
  requestBlurNextCaptureOnce: false,
}

function prefsPath(): string {
  return join(app.getPath('userData'), 'user-prefs.json')
}

export function readUserPrefs(): UserPrefs {
  const path = prefsPath()
  if (!existsSync(path)) return { ...DEFAULT_PREFS }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<UserPrefs>
    return {
      notifyOnScreenshotCapture: raw.notifyOnScreenshotCapture === true,
      requestBlurForAllCaptures: raw.requestBlurForAllCaptures === true,
      requestBlurNextCaptureOnce: raw.requestBlurNextCaptureOnce === true,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writeUserPrefs(partial: Partial<UserPrefs>): UserPrefs {
  const current = readUserPrefs()
  const next: UserPrefs = {
    notifyOnScreenshotCapture:
      partial.notifyOnScreenshotCapture !== undefined
        ? partial.notifyOnScreenshotCapture === true
        : current.notifyOnScreenshotCapture,
    requestBlurForAllCaptures:
      partial.requestBlurForAllCaptures !== undefined
        ? partial.requestBlurForAllCaptures === true
        : current.requestBlurForAllCaptures,
    requestBlurNextCaptureOnce:
      partial.requestBlurNextCaptureOnce !== undefined
        ? partial.requestBlurNextCaptureOnce === true
        : current.requestBlurNextCaptureOnce,
  }
  writeFileSync(prefsPath(), JSON.stringify(next), 'utf-8')
  return next
}

export function shouldNotifyOnScreenshotCapture(): boolean {
  return readUserPrefs().notifyOnScreenshotCapture === true
}
