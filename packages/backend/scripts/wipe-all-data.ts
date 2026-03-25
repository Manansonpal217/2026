#!/usr/bin/env npx tsx
/**
 * Wipes all screenshot and app data from the entire system:
 * - R2/S3 bucket: deletes all objects
 * - PostgreSQL: truncates all tables
 * - Redis: obliterates BullMQ queues and flushes DB
 *
 * Run from packages/backend with .env present:
 *   pnpm run wipe:all
 *
 * WARNING: This is destructive. Use only for local development.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { loadConfig } from '../src/config.js'
import { prisma } from '../src/db/prisma.js'
import { getRedis } from '../src/db/redis.js'

async function wipeR2(config: ReturnType<typeof loadConfig>): Promise<void> {
  let endpoint = (config as { S3_ENDPOINT?: string }).S3_ENDPOINT
  if (!endpoint || !config.AWS_ACCESS_KEY_ID) {
    console.log('Skipping R2: S3_ENDPOINT or credentials not set')
    return
  }

  // R2 endpoint should be base URL only (no bucket path). Strip trailing /bucket if present.
  const bucket = config.S3_SCREENSHOT_BUCKET
  if (endpoint.endsWith(`/${bucket}`)) {
    endpoint = endpoint.replace(
      new RegExp(`/${bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      ''
    )
  }

  const s3 = new S3Client({
    region: config.AWS_REGION || 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
    },
  })

  let totalDeleted = 0

  let continuationToken: string | undefined
  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    )

    const contents = list.Contents ?? []
    if (contents.length === 0) break

    const objects = contents.filter((o) => o.Key).map((o) => ({ Key: o.Key! }))

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      })
    )

    totalDeleted += objects.length
    continuationToken = list.NextContinuationToken
    process.stdout.write(`\rR2: deleted ${totalDeleted} objects...`)
  } while (continuationToken)

  if (totalDeleted > 0) {
    console.log(`\rR2: deleted ${totalDeleted} objects.`)
  } else {
    console.log('R2: bucket already empty.')
  }
}

async function wipePostgres(): Promise<void> {
  // Truncate all tables with CASCADE to handle foreign keys
  const tables = [
    'AuditLog',
    'ActivityLog',
    'Screenshot',
    'TimeSession',
    'Task',
    'Project',
    'OAuthState',
    'Integration',
    'Invite',
    'RefreshToken',
    'User',
    'OrgSettings',
    'Organization',
  ]

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "${tables.join('", "')}" CASCADE
  `)
  console.log('PostgreSQL: all tables truncated.')
}

async function wipeRedis(config: ReturnType<typeof loadConfig>): Promise<void> {
  const redis = getRedis(config)
  await redis.flushdb()
  console.log('Redis: database flushed.')
}

async function main(): Promise<void> {
  console.log('Wiping all data (R2 + PostgreSQL + Redis)...\n')

  const config = loadConfig()

  try {
    await wipeR2(config)
  } catch (err) {
    console.error('R2 wipe failed:', (err as Error).message)
    console.log('Continuing with PostgreSQL and Redis...')
  }
  await wipePostgres()
  await wipeRedis(config)

  await prisma.$disconnect()

  console.log('\nDone. All data cleared.')
  console.log('\nDesktop app: To clear local screenshots and DB, delete these folders/files:')
  console.log('  - ~/Library/Application Support/TrackSync/screenshots/  (or Electron/ in dev)')
  console.log('  - ~/Library/Application Support/TrackSync/local.db')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
