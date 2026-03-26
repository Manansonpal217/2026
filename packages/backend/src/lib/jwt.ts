import * as jose from 'jose'
import { randomUUID } from 'crypto'

export interface TokenPayload {
  jti: string
  sub: string
  org_id: string
  role: string
  iat: number
  exp: number
}

export interface MfaPendingPayload {
  jti: string
  sub: string
  org_id: string
  scope: 'mfa_pending'
  iat: number
  exp: number
}

let privateKey: jose.KeyLike
let publicKey: jose.KeyLike

export async function initJwtKeys(
  privateKeyPem: string | undefined,
  publicKeyPem: string | undefined,
  opts?: { requirePersistentKeys?: boolean }
): Promise<void> {
  if (opts?.requirePersistentKeys) {
    if (!privateKeyPem?.trim() || !publicKeyPem?.trim()) {
      throw new Error(
        'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required in production (RSA PEM). Generate with: pnpm --filter backend exec tsx scripts/generate-keys.ts'
      )
    }
  }
  if (privateKeyPem && publicKeyPem) {
    privateKey = await jose.importPKCS8(privateKeyPem, 'RS256')
    publicKey = await jose.importSPKI(publicKeyPem, 'RS256')
  } else {
    const { publicKey: pub, privateKey: priv } = await jose.generateKeyPair('RS256', {
      modulusLength: 2048,
    })
    privateKey = priv
    publicKey = pub
  }
}

export async function issueAccessToken(
  userId: string,
  orgId: string,
  role: string
): Promise<string> {
  return new jose.SignJWT({
    jti: randomUUID(),
    org_id: orgId,
    role,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey)
}

export async function issueMfaPendingToken(userId: string, orgId: string): Promise<string> {
  return new jose.SignJWT({
    jti: randomUUID(),
    org_id: orgId,
    scope: 'mfa_pending',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jose.jwtVerify(token, publicKey)
  const p = payload as unknown as TokenPayload & { scope?: string }
  if (p.scope === 'mfa_pending') {
    throw new Error('Token is pending MFA verification')
  }
  return p
}

export async function verifyMfaPendingToken(token: string): Promise<MfaPendingPayload> {
  const { payload } = await jose.jwtVerify(token, publicKey)
  const p = payload as unknown as MfaPendingPayload
  if (p.scope !== 'mfa_pending') {
    throw new Error('Invalid token scope')
  }
  return p
}

export function createRefreshToken(): string {
  return randomUUID() + randomUUID().replace(/-/g, '')
}
