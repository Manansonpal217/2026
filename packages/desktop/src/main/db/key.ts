import { randomBytes } from 'crypto'
import keytar from 'keytar'

const SERVICE = 'tracksync'
const ACCOUNT = 'db-key'

/**
 * Returns a stable 64-character hex string used as the SQLite cipher key.
 *
 * Priority:
 *  1. DB_ENCRYPTION_KEY env var (dev/CI override)
 *  2. OS keychain via keytar (persisted across app restarts)
 *  3. Generated fresh, stored in keychain for future use
 */
export async function getDbEncryptionKey(): Promise<string> {
  // Dev override via environment variable
  if (process.env.DB_ENCRYPTION_KEY) {
    return process.env.DB_ENCRYPTION_KEY
  }

  // Try keychain first
  const existing = await keytar.getPassword(SERVICE, ACCOUNT)
  if (existing) return existing

  // Generate and persist a new 32-byte (64 hex chars) key
  const newKey = randomBytes(32).toString('hex')
  await keytar.setPassword(SERVICE, ACCOUNT, newKey)
  return newKey
}
