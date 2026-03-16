import { createCipheriv, randomBytes } from 'crypto'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { app, Notification } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import screenshotDesktop from 'screenshot-desktop'
import sharp from 'sharp'
import { getDb } from '../db/index.js'
import { getDbEncryptionKey } from '../db/key.js'

/**
 * AES-256-GCM wire format:
 *  [12 bytes: IV][16 bytes: authTag][ciphertext]
 */
async function encryptBuffer(plaintext: Buffer, keyHex: string): Promise<Buffer> {
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted])
}

export async function captureAndStore(sessionId: string, activityScore = 0): Promise<string | null> {
  try {
    // Capture screenshot as PNG
    const imgBuffer: Buffer = await screenshotDesktop({ format: 'png' })

    // Compress to WebP using sharp (reduces file size ~70%)
    const webpBuffer = await sharp(imgBuffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()

    // Encrypt
    const keyHex = await getDbEncryptionKey()
    const encrypted = await encryptBuffer(webpBuffer, keyHex)

    // Write to userData/screenshots/
    const screenshotsDir = join(app.getPath('userData'), 'screenshots')
    mkdirSync(screenshotsDir, { recursive: true })

    const id = uuidv4()
    const filename = `${id}.enc`
    const localPath = join(screenshotsDir, filename)
    writeFileSync(localPath, encrypted)

    // Persist to local SQLite
    const db = getDb()
    db.prepare(`
      INSERT INTO local_screenshots
        (id, session_id, local_path, taken_at, activity_score, file_size_bytes, synced, sync_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      id,
      sessionId,
      localPath,
      new Date().toISOString(),
      activityScore,
      encrypted.length,
      new Date().toISOString(),
    )

    // OS notification (silent — no sound)
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'TrackSync',
        body: 'Screenshot captured',
        silent: true,
      })
      notif.show()
    }

    return id
  } catch (err) {
    console.error('[captureAndStore] Failed:', err)
    return null
  }
}
