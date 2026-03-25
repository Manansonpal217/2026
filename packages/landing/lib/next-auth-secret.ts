/** Same resolution for API route + Edge middleware (middleware does not read authOptions.secret). */
const DEV_FALLBACK_NEXTAUTH_SECRET =
  'local-dev-nextauth-secret-do-not-use-in-production-min-32chars'

let warnedDevSecretFallback = false

/**
 * Returns a secret for signing/verifying NextAuth JWTs.
 * In production, `NEXTAUTH_SECRET` or `AUTH_SECRET` must be set.
 */
export function getNextAuthSecret(): string | undefined {
  const fromEnv = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV !== 'production') {
    if (!warnedDevSecretFallback) {
      warnedDevSecretFallback = true
      console.warn(
        '[next-auth] NEXTAUTH_SECRET is not set; using a fixed dev-only default. ' +
          'Set NEXTAUTH_SECRET in .env.local for production parity.'
      )
    }
    return DEV_FALLBACK_NEXTAUTH_SECRET
  }
  return undefined
}
