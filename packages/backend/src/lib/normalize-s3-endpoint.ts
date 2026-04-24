/**
 * R2 / path-style S3 expects the API origin only (no bucket path segment).
 * Some .env files mistakenly append /bucket-name to the endpoint URL.
 */
export function normalizeS3Endpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  try {
    const u = new URL(trimmed)
    const path = u.pathname.replace(/\/$/, '') || ''
    if (path && path !== '/') {
      console.warn(
        `[s3] S3_ENDPOINT contained path "${u.pathname}"; using "${u.origin}" only. ` +
          'Put the bucket name in RELEASES_S3_BUCKET / S3_SCREENSHOT_BUCKET, not in the URL.'
      )
      return u.origin
    }
    return trimmed
  } catch {
    return trimmed
  }
}
