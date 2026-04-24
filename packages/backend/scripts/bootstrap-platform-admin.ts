#!/usr/bin/env npx tsx
/**
 * One-shot local dev: ensure a platform super admin exists (org_id must stay null).
 *
 *   pnpm --filter backend run bootstrap:platform-admin
 *
 * Override via env: BOOTSTRAP_PLATFORM_ADMIN_EMAIL, BOOTSTRAP_PLATFORM_ADMIN_PASSWORD, BOOTSTRAP_PLATFORM_ADMIN_NAME
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password.js'

const EMAIL = (
  process.env.BOOTSTRAP_PLATFORM_ADMIN_EMAIL ?? 'manansonpal217@gmail.com'
).toLowerCase()
const PASSWORD = process.env.BOOTSTRAP_PLATFORM_ADMIN_PASSWORD ?? 'Manan217@'
const NAME = process.env.BOOTSTRAP_PLATFORM_ADMIN_NAME ?? 'Manan Sonpal'

async function main() {
  const prisma = new PrismaClient()
  const password_hash = await hashPassword(PASSWORD)

  const existing = await prisma.user.findFirst({ where: { email: EMAIL } })
  if (existing && !existing.is_platform_admin) {
    console.error(
      `\n  Refusing to bootstrap: ${EMAIL} is already used by a non–platform-admin account (org user).\n` +
        `  Remove or change that user in the database, or pick a different BOOTSTRAP_PLATFORM_ADMIN_EMAIL.\n`
    )
    process.exit(1)
  }

  const user = existing?.is_platform_admin ? existing : null

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        name: NAME,
        role: 'OWNER',
        status: 'ACTIVE',
        is_platform_admin: true,
        org_id: null,
        manager_id: null,
        email_verified: true,
      },
    })
    console.log(`\n  Platform admin updated: ${EMAIL} (${user.id})\n`)
  } else {
    const created = await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        password_hash,
        role: 'OWNER',
        status: 'ACTIVE',
        is_platform_admin: true,
        org_id: null,
        email_verified: true,
      },
    })
    console.log(`\n  Platform admin created: ${EMAIL} (${created.id})\n`)
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
