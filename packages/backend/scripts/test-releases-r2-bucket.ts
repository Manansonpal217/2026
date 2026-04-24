#!/usr/bin/env npx tsx
/**
 * Verifies R2/S3 connectivity to the desktop releases bucket (default: appreleases).
 * Run: pnpm --filter backend run test:releases-bucket
 *
 * Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_ENDPOINT (for R2), AWS_REGION=auto (R2)
 * Optional: RELEASES_S3_BUCKET (defaults to appreleases)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { normalizeS3Endpoint } from '../src/lib/normalize-s3-endpoint.js'

const DEFAULT_BUCKET = 'appreleases'

async function main() {
  const bucket = process.env.RELEASES_S3_BUCKET || DEFAULT_BUCKET
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!accessKeyId || !secretAccessKey) {
    console.error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY')
    process.exit(1)
  }

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  }

  const rawEndpoint = process.env.S3_ENDPOINT
  if (!rawEndpoint) {
    console.error(
      'Missing S3_ENDPOINT (required for Cloudflare R2), e.g. https://<account_id>.r2.cloudflarestorage.com'
    )
    process.exit(1)
  }
  const endpoint = normalizeS3Endpoint(rawEndpoint)
  clientConfig.endpoint = endpoint
  clientConfig.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'false' ? false : true

  const s3 = new S3Client(clientConfig)

  console.log(`HeadBucket: ${bucket} @ ${endpoint}`)
  await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  console.log('OK: Bucket exists and credentials can access it.')
}

main().catch((err) => {
  console.error('Failed:', err?.name ?? err, err?.message ?? err)
  process.exit(1)
})
