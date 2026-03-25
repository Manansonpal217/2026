#!/usr/bin/env npx tsx
/**
 * Uploads a dummy screenshot to S3/R2 to verify bucket connectivity.
 * Run: pnpm run test:s3 (from packages/backend, with .env present)
 * Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_SCREENSHOT_BUCKET (and S3_ENDPOINT for R2)
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
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { loadConfig } from '../src/config.js'

// Minimal 1x1 red pixel WebP (22 bytes)
const DUMMY_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64'
)

async function main() {
  const config = loadConfig()
  const bucket = config.S3_SCREENSHOT_BUCKET

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: config.AWS_REGION || 'us-east-1',
    ...(config.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
      },
    }),
  }

  const endpoint = process.env.S3_ENDPOINT
  if (endpoint) {
    clientConfig.endpoint = endpoint
    clientConfig.forcePathStyle = true
  }

  const s3 = new S3Client(clientConfig)

  const testKey = `_test/dummy-${Date.now()}.webp`

  console.log(`Uploading dummy screenshot to s3://${bucket}/${testKey}...`)

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: DUMMY_WEBP,
      ContentType: 'image/webp',
      // Omit ServerSideEncryption for R2 compatibility
    })
  )

  await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: testKey,
    })
  )

  console.log('OK: Dummy screenshot uploaded and verified.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
