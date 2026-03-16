import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Fast SHA-256 hash for high-entropy tokens (refresh tokens).
 * Refresh tokens are cryptographically random 64-char strings, so
 * bcrypt is unnecessary — SHA-256 is secure and enables direct DB lookup.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
