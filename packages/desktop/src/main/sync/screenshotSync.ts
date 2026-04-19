import { createDecipheriv } from 'crypto'
import { readFileSync, unlinkSync } from 'fs'
import { getDb } from '../db/index.js'
import { getDbEncryptionKey } from '../db/key.js'
import { getApiBase, getAuthHeaders, syncRunningSessionToBackend } from './sessionSync.js'
import { getBackoffMinutes } from './resilience.js'

interface LocalScreenshot {
  id: string
  session_id: string
  local_path: string
  thumb_local_path: string | null
  taken_at: string
  activity_score: number
  file_size_bytes: number
  thumb_file_size_bytes: number
  /** 1 = ask server to blur this upload when org policy allows */
  request_blur?: number
  sync_attempts: number
  last_sync_attempt_at: string | null
  pending_upload_id: string | null
}

const UPLOAD_CONCURRENCY = 4
const nowIso = () => new Date().toISOString()

function confirmBody(uploadId: string, screenshot: LocalScreenshot): string {
  const requestBlur = screenshot.request_blur === 1
  return JSON.stringify({ upload_id: uploadId, ...(requestBlur ? { request_blur: true } : {}) })
}

/** Best-effort parse of JSON or text body for last_sync_error (consumes response body). */
async function readErrorHint(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim()
    if (!text) return ''
    try {
      const j = JSON.parse(text) as { code?: string; message?: string }
      const parts = [j.code, j.message].filter(Boolean)
      if (parts.length > 0) return parts.join(': ')
    } catch {
      /* not JSON */
    }
    return text.length > 280 ? `${text.slice(0, 280)}…` : text
  } catch {
    return ''
  }
}

async function readJsonBody(res: Response): Promise<{ code?: string; message?: string } | null> {
  try {
    const text = (await res.text()).trim()
    if (!text) return null
    return JSON.parse(text) as { code?: string; message?: string }
  } catch {
    return null
  }
}

function appendHint(base: string, hint: string): string {
  const h = hint.trim()
  return h ? `${base} — ${h}` : base
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function postScreenshotUploadUrl(
  apiBase: string,
  headers: Record<string, string>,
  screenshot: LocalScreenshot
): Promise<Response> {
  const body: Record<string, unknown> = {
    session_id: screenshot.session_id,
    taken_at: screenshot.taken_at,
    file_size_bytes: screenshot.file_size_bytes,
    activity_score: screenshot.activity_score,
  }
  if (screenshot.thumb_local_path && (screenshot.thumb_file_size_bytes ?? 0) > 0) {
    body.thumb_file_size_bytes = screenshot.thumb_file_size_bytes
  }
  return fetch(`${apiBase}/v1/screenshots/upload-url`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

function safeUnlink(p: string | null | undefined): void {
  if (!p) return
  try {
    unlinkSync(p)
  } catch {
    /* non-fatal */
  }
}

async function syncOneScreenshot(
  apiBase: string,
  headers: Record<string, string>,
  keyHex: string,
  screenshot: LocalScreenshot,
  db: ReturnType<typeof getDb>,
  recordError: (id: string, reason: string, isTransient: boolean) => void
): Promise<{ rateLimited?: boolean } | void> {
  const uploadId = screenshot.pending_upload_id

  if (uploadId) {
    let confirmRes: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      confirmRes = await fetch(`${apiBase}/v1/screenshots/confirm`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: confirmBody(uploadId, screenshot),
      })
      if (confirmRes.ok) break
      if (confirmRes.status === 429) return { rateLimited: true }
      if (confirmRes.status === 422) {
        const j = await readJsonBody(confirmRes.clone())
        if (
          j?.code === 'S3_THUMB_NOT_FOUND' &&
          screenshot.thumb_local_path &&
          (screenshot.thumb_file_size_bytes ?? 0) > 0
        ) {
          const presign = await fetch(`${apiBase}/v1/screenshots/${uploadId}/thumb-presign`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
          })
          if (presign.status === 429) return { rateLimited: true }
          if (!presign.ok) {
            const hint = await readErrorHint(presign.clone())
            recordError(
              screenshot.id,
              appendHint(`thumb-presign failed: HTTP ${presign.status}`, hint),
              presign.status >= 500
            )
            return
          }
          const { thumb_presigned_url } = (await presign.json()) as { thumb_presigned_url: string }
          const thumbDecrypted = await decryptFile(screenshot.thumb_local_path, keyHex)
          const ab = new ArrayBuffer(thumbDecrypted.length)
          new Uint8Array(ab).set(thumbDecrypted)
          let putThumb = await fetch(thumb_presigned_url, {
            method: 'PUT',
            body: ab,
            headers: { 'Content-Type': 'image/webp' },
          })
          for (let a = 0; a < 3 && !putThumb.ok && putThumb.status >= 500; a++) {
            if (a > 0) await sleep(2000)
            putThumb = await fetch(thumb_presigned_url, {
              method: 'PUT',
              body: ab,
              headers: { 'Content-Type': 'image/webp' },
            })
          }
          if (!putThumb.ok) {
            const hint = await readErrorHint(putThumb.clone())
            recordError(
              screenshot.id,
              appendHint(`thumb S3 PUT failed: HTTP ${putThumb.status}`, hint),
              putThumb.status >= 500
            )
            return
          }
          continue
        }
      }
      if (confirmRes.status >= 500 && attempt < 2) {
        await sleep(2000)
        continue
      }
      break
    }
    if (!confirmRes!.ok) {
      const hint = await readErrorHint(confirmRes!.clone())
      const reason = appendHint(`confirm failed: HTTP ${confirmRes!.status}`, hint)
      recordError(screenshot.id, reason, confirmRes!.status >= 500)
      return
    }
    db.prepare(
      `UPDATE local_screenshots SET synced = 1, pending_upload_id = NULL WHERE id = ?`
    ).run(screenshot.id)
    safeUnlink(screenshot.local_path)
    safeUnlink(screenshot.thumb_local_path)
    return
  }

  let uploadRes = await postScreenshotUploadUrl(apiBase, headers, screenshot)
  if (uploadRes.status === 404) {
    await syncRunningSessionToBackend(screenshot.session_id)
    uploadRes = await postScreenshotUploadUrl(apiBase, headers, screenshot)
  }
  if (uploadRes.status === 429) return { rateLimited: true }

  for (let attempt = 0; attempt < 3 && !uploadRes.ok && uploadRes.status >= 500; attempt++) {
    if (attempt > 0) await sleep(2000)
    uploadRes = await postScreenshotUploadUrl(apiBase, headers, screenshot)
  }

  if (!uploadRes.ok) {
    const hint = await readErrorHint(uploadRes.clone())
    const base =
      uploadRes.status === 404
        ? 'upload-url: session not found on server (check API URL & auth)'
        : `upload-url failed: HTTP ${uploadRes.status}`
    recordError(screenshot.id, appendHint(base, hint), uploadRes.status >= 500)
    return
  }

  const json = (await uploadRes.json()) as {
    upload_id: string
    presigned_url: string
    thumb_presigned_url: string | null
    s3_key: string
  }

  const decrypted = await decryptFile(screenshot.local_path, keyHex)

  let putMain: Response
  if (json.thumb_presigned_url && screenshot.thumb_local_path) {
    const thumbDecrypted = await decryptFile(screenshot.thumb_local_path, keyHex)
    const putBodyMain = (() => {
      const ab = new ArrayBuffer(decrypted.length)
      new Uint8Array(ab).set(decrypted)
      return ab
    })()
    const putBodyThumb = (() => {
      const ab = new ArrayBuffer(thumbDecrypted.length)
      new Uint8Array(ab).set(thumbDecrypted)
      return ab
    })()
    let putThumb: Response
    ;[putMain, putThumb] = await Promise.all([
      fetch(json.presigned_url, {
        method: 'PUT',
        body: putBodyMain,
        headers: { 'Content-Type': 'image/webp' },
      }),
      fetch(json.thumb_presigned_url, {
        method: 'PUT',
        body: putBodyThumb,
        headers: { 'Content-Type': 'image/webp' },
      }),
    ])
    for (
      let attempt = 0;
      attempt < 3 &&
      (!putMain.ok || !putThumb.ok) &&
      (putMain.status >= 500 || putThumb.status >= 500);
      attempt++
    ) {
      if (attempt > 0) await sleep(2000)
      ;[putMain, putThumb] = await Promise.all([
        fetch(json.presigned_url, {
          method: 'PUT',
          body: putBodyMain,
          headers: { 'Content-Type': 'image/webp' },
        }),
        fetch(json.thumb_presigned_url, {
          method: 'PUT',
          body: putBodyThumb,
          headers: { 'Content-Type': 'image/webp' },
        }),
      ])
    }
    if (!putThumb.ok) {
      const hint = await readErrorHint(putThumb.clone())
      recordError(
        screenshot.id,
        appendHint(`thumb S3 PUT failed: HTTP ${putThumb.status}`, hint),
        putThumb.status >= 500
      )
      return
    }
  } else {
    const putBodyMain = (() => {
      const ab = new ArrayBuffer(decrypted.length)
      new Uint8Array(ab).set(decrypted)
      return ab
    })()
    putMain = await fetch(json.presigned_url, {
      method: 'PUT',
      body: putBodyMain,
      headers: { 'Content-Type': 'image/webp' },
    })
    for (let attempt = 0; attempt < 3 && !putMain.ok && putMain.status >= 500; attempt++) {
      if (attempt > 0) await sleep(2000)
      putMain = await fetch(json.presigned_url, {
        method: 'PUT',
        body: putBodyMain,
        headers: { 'Content-Type': 'image/webp' },
      })
    }
  }

  if (!putMain.ok) {
    const hint = await readErrorHint(putMain.clone())
    recordError(
      screenshot.id,
      appendHint(`S3 PUT failed: HTTP ${putMain.status}`, hint),
      putMain.status >= 500
    )
    return
  }

  db.prepare(`UPDATE local_screenshots SET pending_upload_id = ? WHERE id = ?`).run(
    json.upload_id,
    screenshot.id
  )

  let confirmRes = await fetch(`${apiBase}/v1/screenshots/confirm`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: confirmBody(json.upload_id, screenshot),
  })
  for (let attempt = 0; attempt < 3 && !confirmRes.ok && confirmRes.status >= 500; attempt++) {
    if (attempt > 0) await sleep(2000)
    confirmRes = await fetch(`${apiBase}/v1/screenshots/confirm`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: confirmBody(json.upload_id, screenshot),
    })
  }
  if (confirmRes.status === 429) return { rateLimited: true }
  if (!confirmRes.ok) {
    const hint = await readErrorHint(confirmRes.clone())
    recordError(
      screenshot.id,
      appendHint(`confirm failed: HTTP ${confirmRes.status}`, hint),
      confirmRes.status >= 500
    )
    return
  }

  db.prepare(`UPDATE local_screenshots SET synced = 1, pending_upload_id = NULL WHERE id = ?`).run(
    screenshot.id
  )
  safeUnlink(screenshot.local_path)
  safeUnlink(screenshot.thumb_local_path)
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
  if (!headers) {
    console.warn('[screenshotSync] skipping: no auth headers (sign in or wait for token refresh)')
    return
  }

  const recordError = (id: string, reason: string, isTransient: boolean) => {
    if (isTransient) {
      db.prepare(
        `UPDATE local_screenshots SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`
      ).run(nowIso(), reason, id)
    } else {
      db.prepare(
        `UPDATE local_screenshots SET sync_attempts = sync_attempts + 1, last_sync_error = ?, last_sync_attempt_at = ? WHERE id = ?`
      ).run(reason, nowIso(), id)
    }
  }

  const queue = [...unsynced]
  let rateLimited = false

  const worker = async () => {
    while (queue.length > 0 && !rateLimited) {
      const screenshot = queue.shift()!
      try {
        const r = await syncOneScreenshot(apiBase, headers, keyHex, screenshot, db, recordError)
        if (r?.rateLimited) rateLimited = true
      } catch (err) {
        console.warn('[screenshotSync] network or unexpected error:', err)
      }
    }
  }

  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()))

  if (rateLimited) return { rateLimited: true }
}
