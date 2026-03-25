/**
 * IndexedDB cache for screenshot image bytes (thumbs + lightbox full).
 * Keys are stable per viewer, subject, and local calendar day so presigned URL rotation does not force re-downloads.
 */

const DB_NAME = 'tracksync-landing-screenshots-v1'
const DB_VERSION = 1
const STORE = 'blobs'

/** Same calendar semantics as myhome day picker: local YYYY-MM-DD */
export function screenshotCacheDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Viewer (session user) + subject (page userId) + local day — unique per dashboard cell. */
export function buildScreenshotCacheScope(
  viewerUserId: string,
  subjectUserId: string,
  day: Date
): string {
  return `${viewerUserId}|${subjectUserId}|${screenshotCacheDayKey(day)}`
}

type Entry = {
  blob: Blob
  contentType: string
  savedAt: number
}

function entryKey(kind: 'thumb' | 'full', scope: string, screenshotId: string): string {
  const p = kind === 'thumb' ? 't' : 'f'
  return `${p}|${scope}|${screenshotId}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

export async function getCachedBlob(
  kind: 'thumb' | 'full',
  scope: string,
  screenshotId: string
): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const r = store.get(entryKey(kind, scope, screenshotId))
      r.onerror = () => reject(r.error)
      r.onsuccess = () => {
        const row = r.result as Entry | undefined
        resolve(row?.blob ?? null)
      }
    })
  } catch {
    return null
  }
}

export async function putCachedBlob(
  kind: 'thumb' | 'full',
  scope: string,
  screenshotId: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  const entry: Entry = { blob, contentType, savedAt: Date.now() }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const r = store.put(entry, entryKey(kind, scope, screenshotId))
    r.onerror = () => reject(r.error)
    r.onsuccess = () => resolve()
  })
}

/**
 * Drop cache rows for this scope whose screenshot id is not in the valid set (e.g. list shrank or retention).
 */
export async function pruneScreenshotCache(
  scope: string,
  validScreenshotIds: Set<string>
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDb()
    const thumbPrefix = `t|${scope}|`
    const fullPrefix = `f|${scope}|`
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const req = store.openCursor()
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve()
          return
        }
        const key = cursor.key as string
        if (key.startsWith(thumbPrefix)) {
          const id = key.slice(thumbPrefix.length)
          if (!validScreenshotIds.has(id)) cursor.delete()
        } else if (key.startsWith(fullPrefix)) {
          const id = key.slice(fullPrefix.length)
          if (!validScreenshotIds.has(id)) cursor.delete()
        }
        cursor.continue()
      }
    })
  } catch {
    /* ignore */
  }
}

/** Wipe all cached screenshot bytes (call on sign-out). */
export async function clearScreenshotImageCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
    req.onblocked = () => resolve()
  })
}
