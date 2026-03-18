import { createDecipheriv } from 'crypto'
import { readFileSync, unlinkSync } from 'fs'
import { getDb } from '../db/index.js'
import { getDbEncryptionKey } from '../db/key.js'
import { getApiBase, getAuthHeaders } from './sessionSync.js'
import { getBackoffMinutes } from './resilience.js'

interface LocalScreenshot {
  id: string
  session_id: string
  local_path: string
  taken_at: string
  activity_score: number
  file_size_bytes: number
  sync_attempts: number
  last_sync_attempt_at: string | null
}

const nowIso = () => new Date().toISOString()

async function decryptFile(localPath: string, keyHex: string): Promise<Buffer> {
  const encrypted = readFileSync(localPath)
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex')

  // Format: [12 IV][16 authTag][ciphertext]
  const iv = encrypted.subarray(0, 12)
  const authTag = encrypted.subarray(12, 28)
  const ciphertext = encrypted.subarray(28)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export async function syncPendingScreenshots(): Promise<{ rateLimited?: boolean } | void> {
  const db = getDb()
  const keyHex = await getDbEncryptionKey()

  const candidates = db
    .prepare(
      `SELECT * FROM local_screenshots
       WHERE synced = 0
       ORDER BY taken_at ASC LIMIT 40`
    )
    .all() as LocalScreenshot[]

  const unsynced = candidates
    .filter((s) => {
      const backoffMin = getBackoffMinutes(s.sync_attempts ?? 0)
      if (!s.last_sync_attempt_at) return true
      const lastAttempt = new Date(s.last_sync_attempt_at).getTime()
      return Date.now() - lastAttempt >= backoffMin * 60 * 1000
    })
    .slice(0, 20)

  if (unsynced.length === 0) return

  const apiBase = getApiBase()
  const headers = await getAuthHeaders()
  if (!headers) return

  for (const screenshot of unsynced) {
    try {
      const uploadRes = await fetch(`${apiBase}/v1/screenshots/upload-url`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: screenshot.session_id,
          taken_at: screenshot.taken_at,
          file_size_bytes: screenshot.file_size_bytes,
          activity_score: screenshot.activity_score,
        }),
      })

      if (uploadRes.status === 429) return { rateLimited: true }

      if (!uploadRes.ok) {
        const isTransient = uploadRes.status >= 500
        const reason = `upload-url failed: HTTP ${uploadRes.status}`
        if (isTransient) {
          db.prepare(
            `UPDATE local_screenshots SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
          ).run(nowIso(), reason, screenshot.id)
        } else {
          db.prepare(
            `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
          ).run(reason, nowIso(), screenshot.id)
        }
        continue
      }

      const { upload_id, presigned_url } = (await uploadRes.json()) as {
        upload_id: string
        presigned_url: string
        s3_key: string
      }

      const decrypted = await decryptFile(screenshot.local_path, keyHex)

      const putRes = await fetch(presigned_url, {
        method: 'PUT',
        body: (() => {
          const ab = new ArrayBuffer(decrypted.length)
          new Uint8Array(ab).set(decrypted)
          return ab
        })(),
        headers: { 'Content-Type': 'image/webp' },
      })

      if (!putRes.ok) {
        const isTransient = putRes.status >= 500
        const reason = `S3 PUT failed: HTTP ${putRes.status}`
        if (isTransient) {
          db.prepare(
            `UPDATE local_screenshots SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
          ).run(nowIso(), reason, screenshot.id)
        } else {
          db.prepare(
            `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
          ).run(reason, nowIso(), screenshot.id)
        }
        continue
      }

      const confirmRes = await fetch(`${apiBase}/v1/screenshots/confirm`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id }),
      })

      if (confirmRes.status === 429) return { rateLimited: true }

      if (!confirmRes.ok) {
        const isTransient = confirmRes.status >= 500
        const reason = `confirm failed: HTTP ${confirmRes.status}`
        if (isTransient) {
          db.prepare(
            `UPDATE local_screenshots SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
          ).run(nowIso(), reason, screenshot.id)
        } else {
          db.prepare(
            `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
          ).run(reason, nowIso(), screenshot.id)
        }
        continue
      }

      db.prepare(`UPDATE local_screenshots SET synced = 1 WHERE id = ?`).run(screenshot.id)

      try {
        unlinkSync(screenshot.local_path)
      } catch {
        // Non-fatal: file already deleted
      }
    } catch {
      // Network error — do not increment; will retry next cycle
    }
  }
}
