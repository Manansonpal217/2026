import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as keytar from 'keytar'

const SERVICE = 'io.tracksync.app'
const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'
const TOKENS_FILE = 'auth-tokens.dat'

/** Set when encrypted token file could not be decrypted (e.g. OS keychain / app identity changed). Consumed by auth layer to force login UI. */
let authStorageBecameUnreadable = false

export function consumeAuthStorageUnreadableFlag(): boolean {
  if (!authStorageBecameUnreadable) return false
  authStorageBecameUnreadable = false
  return true
}

function getTokensPath(): string {
  return join(app.getPath('userData'), TOKENS_FILE)
}

/** Serialize concurrent loads so we do not race two decrypts on one broken file (duplicate log noise / flags). */
let loadTokensChain: Promise<{
  accessToken: string
  refreshToken: string
} | null> = Promise.resolve(null)

function parseTokenPayload(decrypted: string): {
  accessToken: string
  refreshToken: string
} | null {
  const parsed = JSON.parse(decrypted) as { accessToken?: string; refreshToken?: string }
  if (parsed.accessToken && parsed.refreshToken) {
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
  }
  return null
}

/** Legacy: file was written as encryptString → latin1 → utf-8 text (can corrupt ciphertext). Try recovery once. */
function tryDecryptLegacyFile(path: string): { accessToken: string; refreshToken: string } | null {
  try {
    const blob = readFileSync(path, 'latin1')
    const decrypted = safeStorage.decryptString(Buffer.from(blob, 'latin1'))
    return parseTokenPayload(decrypted)
  } catch {
    return null
  }
}

async function storeTokensInKeytar(accessToken: string, refreshToken: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCESS_KEY, accessToken)
  await keytar.setPassword(SERVICE, REFRESH_KEY, refreshToken)
}

/** Store tokens using Electron safeStorage (primary) or keytar (fallback). */
export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  const payload = JSON.stringify({ accessToken, refreshToken })

  if (safeStorage.isEncryptionAvailable()) {
    const path = getTokensPath()
    try {
      const encrypted = safeStorage.encryptString(payload)
      // Write raw ciphertext bytes — never round-trip through string encodings.
      writeFileSync(path, encrypted)
      const roundTrip = safeStorage.decryptString(readFileSync(path))
      const verified = parseTokenPayload(roundTrip)
      if (!verified) {
        throw new Error('safeStorage round-trip produced invalid payload')
      }
      try {
        await keytar.deletePassword(SERVICE, ACCESS_KEY)
        await keytar.deletePassword(SERVICE, REFRESH_KEY)
      } catch {
        // Ignore
      }
    } catch (err) {
      console.warn('[auth] safeStorage file persist failed, using keytar:', err)
      try {
        if (existsSync(path)) unlinkSync(path)
      } catch {
        // Ignore
      }
      await storeTokensInKeytar(accessToken, refreshToken)
    }
  } else {
    await storeTokensInKeytar(accessToken, refreshToken)
  }
}

async function loadTokensOnce(): Promise<{
  accessToken: string
  refreshToken: string
} | null> {
  let encryptedFileDecryptFailed = false

  // 1. Try safeStorage file first (raw buffer, then legacy latin1/utf-8 layout)
  if (safeStorage.isEncryptionAvailable()) {
    const path = getTokensPath()
    if (existsSync(path)) {
      try {
        const buf = readFileSync(path)
        const decrypted = safeStorage.decryptString(buf)
        const parsed = parseTokenPayload(decrypted)
        if (parsed) {
          authStorageBecameUnreadable = false
          return parsed
        }
        throw new Error('Token file contained invalid JSON')
      } catch {
        const legacy = tryDecryptLegacyFile(path)
        if (legacy) {
          authStorageBecameUnreadable = false
          try {
            await storeTokens(legacy.accessToken, legacy.refreshToken)
          } catch {
            // Keep legacy tokens for this session
          }
          return legacy
        }
        encryptedFileDecryptFailed = true
        console.warn(
          '[auth] Failed to load tokens from safeStorage file (see next line if corrupt / key mismatch).'
        )
        console.warn(
          '[auth] If you recently reinstalled the app or changed login keychain, sign in again. Corrupt token file was removed.'
        )
        try {
          unlinkSync(path)
        } catch {
          // Ignore
        }
      }
    }
  }

  // 2. Fallback to keytar (for migration from older installs or when safeStorage file path fails)
  try {
    const accessToken = await keytar.getPassword(SERVICE, ACCESS_KEY)
    const refreshToken = await keytar.getPassword(SERVICE, REFRESH_KEY)
    if (accessToken && refreshToken) {
      await storeTokens(accessToken, refreshToken)
      authStorageBecameUnreadable = false
      return { accessToken, refreshToken }
    }
  } catch (err) {
    console.warn('[auth] keytar fallback failed:', err)
  }

  if (encryptedFileDecryptFailed) {
    authStorageBecameUnreadable = true
  }

  return null
}

/** Load tokens from safeStorage file (primary) or keytar (fallback). */
export async function loadTokens(): Promise<{
  accessToken: string
  refreshToken: string
} | null> {
  const run = () => loadTokensOnce()
  loadTokensChain = loadTokensChain.then(run, run)
  return loadTokensChain
}

/** Clear stored tokens. */
export async function clearTokens(): Promise<void> {
  authStorageBecameUnreadable = false
  if (safeStorage.isEncryptionAvailable()) {
    const path = getTokensPath()
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch (err) {
        console.warn('[auth] Failed to remove tokens file:', err)
      }
    }
  }
  try {
    await keytar.deletePassword(SERVICE, ACCESS_KEY)
    await keytar.deletePassword(SERVICE, REFRESH_KEY)
  } catch {
    // Ignore
  }
}
