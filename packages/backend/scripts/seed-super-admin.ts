/**
 * Seed script: provisions the first platform super admin.
 *
 * Usage:
 *   pnpm --filter backend exec tsx scripts/seed-super-admin.ts
 *
 * Idempotent: skips if a user with is_platform_admin=true already exists.
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

const EMAIL = 'superadmin@tracksync.dev'
const NAME = 'Platform Admin'
const SALT_ROUNDS = 12

async function main() {
  const prisma = new PrismaClient()

  try {
    const existing = await prisma.user.findFirst({
      where: { is_platform_admin: true },
      select: { id: true, email: true },
    })

    if (existing) {
      console.log(`\n  Platform admin already exists: ${existing.email} (${existing.id})`)
      console.log('  Skipping seed.\n')
      return
    }

    const tempPassword = randomBytes(16).toString('base64url')
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        password_hash: passwordHash,
        role: 'OWNER',
        status: 'ACTIVE',
        is_platform_admin: true,
        org_id: null,
      },
    })

    console.log('\n  ────────────────────────────────────────────')
    console.log('  Platform Super Admin Created')
    console.log('  ────────────────────────────────────────────')
    console.log(`  Email:    ${EMAIL}`)
    console.log(`  Password: ${tempPassword}`)
    console.log(`  User ID:  ${user.id}`)
    console.log('  ────────────────────────────────────────────\n')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
