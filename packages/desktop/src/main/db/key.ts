import { createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import keytar from 'keytar'

const SERVICE = 'tracksync'
const ACCOUNT = 'db-key'

/**
 * Returns a stable 64-character hex string used as the SQLite cipher key.
 *
 * Priority:
 *  1. DB_ENCRYPTION_KEY env var (dev/CI override)
 *  2. OS keychain via keytar (persisted across app restarts)
 *  3. File-based fallback in userData (used when Windows Credential Manager is unavailable)
 *  4. Generated fresh, stored via whichever mechanism is available
 */
export async function getDbEncryptionKey(): Promise<string> {
  if (process.env.DB_ENCRYPTION_KEY) {
    return process.env.DB_ENCRYPTION_KEY
  }

  try {
    const existing = await keytar.getPassword(SERVICE, ACCOUNT)
    if (existing) return existing

    const newKey = randomBytes(32).toString('hex')
    await keytar.setPassword(SERVICE, ACCOUNT, newKey)
    return newKey
  } catch (keytarErr) {
    // Windows Credential Manager may be unavailable (locked profile, group policy, RDP session).
    // Fall back to a file stored in the app userData directory so the DB key survives restarts.
    console.warn('[db/key] keytar unavailable, using file-based key fallback:', keytarErr)
    return getOrCreateFileFallbackKey()
  }
}

function getOrCreateFileFallbackKey(): string {
  const keyPath = join(app.getPath('userData'), '.db-key')
  try {
    if (existsSync(keyPath)) {
      const raw = readFileSync(keyPath, 'utf-8').trim()
      if (/^[0-9a-f]{64}$/.test(raw)) return raw
    }
  } catch {
    // fall through to generate
  }
  // Derive from machine-specific data + random bytes so it's stable for this install
  const machineEntropy = `${process.env.COMPUTERNAME ?? ''}${process.env.USERNAME ?? ''}${process.env.USERPROFILE ?? ''}`
  const base = randomBytes(24).toString('hex')
  const newKey = createHash('sha256')
    .update(base + machineEntropy)
    .digest('hex')
  try {
    writeFileSync(keyPath, newKey, { encoding: 'utf-8', mode: 0o600 })
  } catch (writeErr) {
    console.error('[db/key] Could not persist file-based key:', writeErr)
  }
  return newKey
}
