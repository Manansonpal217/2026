/**
 * Production seed: upserts the platform super admin account.
 *
 * Usage (local / dev with tsx available):
 *   pnpm --filter backend run create-admin
 *
 * Usage (production Docker container):
 *   docker compose exec backend node dist/prisma/create-admin.js
 *
 * Idempotent: uses upsert so it is safe to run multiple times.
 * The user is created WITHOUT an org (org_id = null) and with
 * is_platform_admin = true — identical to how seed-super-admin.ts
 * provisions the platform admin tier.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const EMAIL = 'manan@tracksync.dev'
const NAME = 'Manan Sonpal'
const PASSWORD = 'Manan217@'
const SALT_ROUNDS = 12

async function main() {
  const prisma = new PrismaClient()

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS)

    // Look up by email (org_id is null for platform admins, so we search by email alone)
    const existing = await prisma.user.findFirst({
      where: { email: EMAIL },
      select: { id: true, is_platform_admin: true },
    })

    let userId: string

    if (existing) {
      // Update password + ensure platform admin flag is set
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          password_hash: passwordHash,
          is_platform_admin: true,
          role: 'OWNER',
          status: 'ACTIVE',
        },
        select: { id: true },
      })
      userId = updated.id
      console.log('\n  ────────────────────────────────────────────')
      console.log('  Platform Super Admin Updated (already existed)')
      console.log('  ────────────────────────────────────────────')
    } else {
      // Create fresh — no org, platform admin flag true
      const created = await prisma.user.create({
        data: {
          email: EMAIL,
          name: NAME,
          password_hash: passwordHash,
          role: 'OWNER',
          status: 'ACTIVE',
          is_platform_admin: true,
          mfa_enabled: false,
          org_id: null,
        },
        select: { id: true },
      })
      userId = created.id
      console.log('\n  ────────────────────────────────────────────')
      console.log('  Platform Super Admin Created')
      console.log('  ────────────────────────────────────────────')
    }

    console.log(`  Email:             ${EMAIL}`)
    console.log(`  Password:          ${PASSWORD}`)
    console.log(`  Name:              ${NAME}`)
    console.log(`  User ID:           ${userId}`)
    console.log(`  Role:              OWNER`)
    console.log(`  is_platform_admin: true`)
    console.log(`  org_id:            null  (platform-level, no org tenant)`)
    console.log('  ────────────────────────────────────────────')
    console.log('  Access: POST /v1/app/auth/login')
    console.log('  Dashboard: /admin (platform super admin panel)')
    console.log('  ────────────────────────────────────────────\n')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('\n  [create-admin] FAILED:', err.message ?? err)
  process.exit(1)
})
