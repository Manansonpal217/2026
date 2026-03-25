import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface UserPrefs {
  /** OS notification when a periodic screenshot is saved. Default false. */
  notifyOnScreenshotCapture: boolean
}

const DEFAULT_PREFS: UserPrefs = {
  notifyOnScreenshotCapture: false,
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
  }
  writeFileSync(prefsPath(), JSON.stringify(next), 'utf-8')
  return next
}

export function shouldNotifyOnScreenshotCapture(): boolean {
  return readUserPrefs().notifyOnScreenshotCapture === true
}
