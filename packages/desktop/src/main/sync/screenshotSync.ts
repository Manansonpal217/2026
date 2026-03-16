import { createDecipheriv } from 'crypto'
import { readFileSync, unlinkSync } from 'fs'
import { getDb } from '../db/index.js'
import { getDbEncryptionKey } from '../db/key.js'
import { getApiBase, getAuthHeaders } from './sessionSync.js'

interface LocalScreenshot {
  id: string
  session_id: string
  local_path: string
  taken_at: string
  activity_score: number
  file_size_bytes: number
  sync_attempts: number
}

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

export async function syncPendingScreenshots(): Promise<void> {
  const db = getDb()
  const keyHex = await getDbEncryptionKey()

  const unsynced = db
    .prepare(
      `SELECT * FROM local_screenshots
       WHERE synced = 0 AND sync_attempts < 6
       ORDER BY taken_at ASC LIMIT 20`,
    )
    .all() as LocalScreenshot[]

  if (unsynced.length === 0) return

  const apiBase = getApiBase()
  const headers = await getAuthHeaders()
  if (!headers) return

  for (const screenshot of unsynced) {
    try {
      // Step 1: get presigned upload URL
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

      if (!uploadRes.ok) {
        db.prepare(
          `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
        ).run(`upload-url failed: HTTP ${uploadRes.status}`, screenshot.id)
        continue
      }

      const { upload_id, presigned_url } = (await uploadRes.json()) as {
        upload_id: string
        presigned_url: string
        s3_key: string
      }

      // Step 2: decrypt locally and PUT to presigned URL
      const decrypted = await decryptFile(screenshot.local_path, keyHex)

      const putRes = await fetch(presigned_url, {
        method: 'PUT',
        // Copy into a plain ArrayBuffer to satisfy BodyInit strict typing
        body: (() => { const ab = new ArrayBuffer(decrypted.length); new Uint8Array(ab).set(decrypted); return ab })(),
        headers: { 'Content-Type': 'image/webp' },
      })

      if (!putRes.ok) {
        db.prepare(
          `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
        ).run(`S3 PUT failed: HTTP ${putRes.status}`, screenshot.id)
        continue
      }

      // Step 3: confirm upload
      const confirmRes = await fetch(`${apiBase}/v1/screenshots/confirm`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id }),
      })

      if (!confirmRes.ok) {
        db.prepare(
          `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
        ).run(`confirm failed: HTTP ${confirmRes.status}`, screenshot.id)
        continue
      }

      // Success — mark synced and delete local encrypted file
      db.prepare(`UPDATE local_screenshots SET synced = 1 WHERE id = ?`).run(screenshot.id)

      try {
        unlinkSync(screenshot.local_path)
      } catch {
        // Non-fatal: file already deleted
      }
    } catch (err) {
      db.prepare(
        `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ? WHERE id = ?`,
      ).run(err instanceof Error ? err.message : String(err), screenshot.id)
    }
  }
}
