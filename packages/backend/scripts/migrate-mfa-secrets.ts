/**
 * One-time migration: encrypt existing plaintext mfa_secret values.
 * Run after applying the add_mfa_secret_encrypted migration.
 *
 * Usage: pnpm tsx scripts/migrate-mfa-secrets.ts
 */
import { PrismaClient } from '@prisma/client'
import { loadConfig } from '../src/config.js'
import { encryptMfaSecret } from '../src/lib/integrations/kms.js'

async function main() {
  const config = loadConfig()
  const prisma = new PrismaClient()

  const users = await prisma.user.findMany({
    where: {
      mfa_secret: { not: null },
      mfa_secret_encrypted: null,
    },
    select: { id: true, mfa_secret: true },
  })

  if (users.length === 0) {
    console.log('No users with plaintext MFA secrets to migrate.')
    return
  }

  console.log(`Migrating ${users.length} user(s) with plaintext MFA secrets...`)

  for (const user of users) {
    if (!user.mfa_secret) continue
    const encrypted = await encryptMfaSecret(user.mfa_secret, config)
    await prisma.user.update({
      where: { id: user.id },
      data: { mfa_secret_encrypted: Buffer.from(encrypted), mfa_secret: null },
    })
    console.log(`  Migrated user ${user.id}`)
  }

  console.log('Done.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
