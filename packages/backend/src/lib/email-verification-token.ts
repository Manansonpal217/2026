import type { Redis } from 'ioredis'
import type { PrismaClient } from '@prisma/client'

export const EMAIL_VERIFY_TOKEN_TTL_SEC = 86400

/** After a successful verify, replay the same token for this long (Strict Mode / double fetch). */
export const EMAIL_VERIFY_CONSUMED_TTL_SEC = 3600

export function emailVerifyConsumedKey(token: string): string {
  return `email:verify-consumed:${token}`
}

export async function storeEmailVerificationToken(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  token: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TOKEN_TTL_SEC * 1000)
  await prisma.emailVerificationToken.create({
    data: { user_id: userId, token, expires_at: expiresAt },
  })
  await redis.set(`email:verify:${token}`, userId, 'EX', EMAIL_VERIFY_TOKEN_TTL_SEC)
}
