import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'
import { randomBytes } from 'crypto'

const ISSUER = 'TrackSync'

export function generateMfaSecret(): string {
  return generateSecret()
}

// Re-export with the old name for backward-compat with callers
export { generateMfaSecret as generateSecret }

export function generateTotpUri(email: string, secret: string): string {
  return generateURI({ label: email, secret, issuer: ISSUER })
}

export async function generateQrCodeDataUrl(otpUri: string): Promise<string> {
  return QRCode.toDataURL(otpUri)
}

export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ token, secret })
    return result.valid
  } catch {
    return false
  }
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(4).toString('hex').toUpperCase()
  )
}

export function formatBackupCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}
