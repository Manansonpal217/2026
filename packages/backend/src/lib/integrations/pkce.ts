import { randomBytes, createHash } from 'crypto'

/**
 * Generate PKCE code_verifier and code_challenge (S256).
 * RFC 7636: code_verifier 43-128 chars, code_challenge = base64url(sha256(verifier))
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(codeVerifier).digest()
  const codeChallenge = hash.toString('base64url')
  return { codeVerifier, codeChallenge }
}
