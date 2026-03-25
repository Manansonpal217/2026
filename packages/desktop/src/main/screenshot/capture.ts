import { createCipheriv, randomBytes } from 'crypto'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { app, Notification } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import screenshotDesktop from 'screenshot-desktop'
import sharp from 'sharp'
import { getDb } from '../db/index.js'
import { getDbEncryptionKey } from '../db/key.js'
import { shouldNotifyOnScreenshotCapture } from '../userPrefs.js'

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

export async function captureAndStore(
  sessionId: string,
  activityScore = 0
): Promise<string | null> {
  try {
    console.log('[screenshot] Capturing...')
    // Capture screenshot as PNG
    const imgBuffer: Buffer = await screenshotDesktop({ format: 'png' })

    // Compress to WebP using sharp (reduces file size ~70%)
    const webpBuffer = await sharp(imgBuffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()

    const thumbWebpBuffer = await sharp(imgBuffer)
      .resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 65 })
      .toBuffer()

    // Encrypt
    const keyHex = await getDbEncryptionKey()
    const encrypted = await encryptBuffer(webpBuffer, keyHex)
    const thumbEncrypted = await encryptBuffer(thumbWebpBuffer, keyHex)

    // Write to userData/screenshots/
    const screenshotsDir = join(app.getPath('userData'), 'screenshots')
    mkdirSync(screenshotsDir, { recursive: true })

    const id = uuidv4()
    const filename = `${id}.enc`
    const thumbFilename = `${id}.thumb.enc`
    const localPath = join(screenshotsDir, filename)
    const thumbLocalPath = join(screenshotsDir, thumbFilename)
    writeFileSync(localPath, encrypted)
    writeFileSync(thumbLocalPath, thumbEncrypted)

    // Persist to local SQLite
    const db = getDb()
    db.prepare(
      `
      INSERT INTO local_screenshots
        (id, session_id, local_path, thumb_local_path, taken_at, activity_score, file_size_bytes, thumb_file_size_bytes, synced, sync_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `
    ).run(
      id,
      sessionId,
      localPath,
      thumbLocalPath,
      new Date().toISOString(),
      activityScore,
      encrypted.length,
      thumbEncrypted.length,
      new Date().toISOString()
    )

    if (shouldNotifyOnScreenshotCapture() && Notification.isSupported()) {
      const notif = new Notification({
        title: 'TrackSync',
        body: 'Screenshot captured',
        silent: true,
      })
      notif.show()
    }

    console.log('[screenshot] Captured successfully, id:', id)
    const { requestSyncSoonAfterCapture } = await import('../sync/immediateSync.js')
    requestSyncSoonAfterCapture()
    return id
  } catch (err) {
    console.error('[captureAndStore] Failed:', err)
    return null
  }
}
