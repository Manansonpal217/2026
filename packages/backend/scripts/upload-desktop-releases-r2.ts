#!/usr/bin/env npx tsx
/**
 * Upload macOS / Windows desktop installers from electron-builder's output dir to
 * Cloudflare R2 (S3-compatible API) and print HTTPS download links.
 *
 * Run from repo root or packages/backend:
 *   pnpm --filter backend run upload:desktop-releases
 *
 * Required environment:
 *   AWS_ACCESS_KEY_ID       — R2 API token access key id
 *   AWS_SECRET_ACCESS_KEY   — R2 API token secret
 *   RELEASES_S3_BUCKET      — R2 bucket name (defaults to appreleases if unset)
 *   RELEASES_PUBLIC_BASE_URL — Public origin for the bucket (no trailing slash), e.g.
 *                             https://pub-xxxxx.r2.dev or https://download.example.com
 *
 * Optional environment:
 *   S3_ENDPOINT             — R2 S3 API URL (https://<accountid>.r2.cloudflarestorage.com)
 *   AWS_REGION              — use `auto` for R2 (default: us-east-1 if unset)
 *   S3_FORCE_PATH_STYLE     — set true when using R2 endpoint (defaults true when S3_ENDPOINT is set)
 *
 * CLI flags:
 *   --release-dir <path>   — Override folder containing installers (default: packages/desktop/release)
 *   --dmg-only             — Upload .dmg only (skip .zip and .exe)
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { normalizeS3Endpoint } from '../src/lib/normalize-s3-endpoint.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function parseArgs(argv: string[]): { releaseDir: string | null; dmgOnly: boolean } {
  let releaseDir: string | null = null
  let dmgOnly = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--release-dir' && argv[i + 1]) {
      releaseDir = argv[++i]
      continue
    }
    if (argv[i] === '--dmg-only') {
      dmgOnly = true
      continue
    }
  }
  return { releaseDir, dmgOnly }
}

function defaultReleaseDir(): string {
  return resolve(__dirname, '..', '..', 'desktop', 'release')
}

function readDesktopVersion(): string {
  const pkgPath = resolve(__dirname, '..', '..', 'desktop', 'package.json')
  const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
  if (!raw.version) throw new Error(`No version in ${pkgPath}`)
  return raw.version
}

function isReleaseArtifact(name: string, dmgOnly: boolean): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith('.blockmap')) return false
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return false
  if (lower === 'builder-debug.yml') return false
  if (lower.endsWith('.appimage') || lower.endsWith('.deb')) return false

  if (lower.endsWith('.dmg')) return true
  if (lower.endsWith('.zip')) return !dmgOnly
  if (lower.endsWith('.exe')) return !dmgOnly
  return false
}

function contentTypeForFile(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.exe')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function escapeFilenameToken(name: string): string {
  return name.replace(/"/g, '\\"')
}

async function main() {
  const { releaseDir: releaseDirArg, dmgOnly } = parseArgs(process.argv)
  const releaseDir = releaseDirArg ? resolve(releaseDirArg) : defaultReleaseDir()

  const bucket = process.env.RELEASES_S3_BUCKET || 'appreleases'
  const publicBase = process.env.RELEASES_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  if (!publicBase) {
    console.error('Missing RELEASES_PUBLIC_BASE_URL (no trailing slash)')
    process.exit(1)
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    console.error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY')
    process.exit(1)
  }

  if (!existsSync(releaseDir)) {
    console.error(`Release directory does not exist: ${releaseDir}`)
    process.exit(1)
  }

  const version = readDesktopVersion()
  const versionTag = version.startsWith('v') ? version : `v${version}`

  const names = readdirSync(releaseDir).filter((n) => {
    try {
      return statSync(join(releaseDir, n)).isFile() && isReleaseArtifact(n, dmgOnly)
    } catch {
      return false
    }
  })

  if (names.length === 0) {
    console.error(`No macOS/Windows installers found in ${releaseDir}`)
    process.exit(1)
  }

  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  }

  const rawEndpoint = process.env.S3_ENDPOINT
  if (rawEndpoint) {
    clientConfig.endpoint = normalizeS3Endpoint(rawEndpoint)
    clientConfig.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'false' ? false : true
  }

  const s3 = new S3Client(clientConfig)

  console.log(`Bucket: ${bucket}`)
  console.log(`Prefix: releases/${versionTag}/`)
  console.log('')

  for (const name of names.sort()) {
    const filePath = join(releaseDir, name)
    const key = `releases/${versionTag}/${name}`
    const stat = statSync(filePath)
    const body = createReadStream(filePath)
    const disp = `attachment; filename="${escapeFilenameToken(name)}"`

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: stat.size,
        ContentType: contentTypeForFile(name),
        ContentDisposition: disp,
      })
    )

    const publicUrl = `${publicBase}/${key
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/')}`

    console.log(name)
    console.log(`  ${publicUrl}`)
    console.log('')
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
