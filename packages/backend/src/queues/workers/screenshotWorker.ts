import { Worker } from 'bullmq'
import sharp from 'sharp'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'

interface ScreenshotJobData {
  screenshotId: string
  s3Key: string
  orgId: string
}

export function screenshotWorker(config: Config): Worker {
  return new Worker<ScreenshotJobData>(
    'screenshot-processing',
    async (job) => {
      const { screenshotId, s3Key, orgId } = job.data

      const orgSettings = await prisma.orgSettings.findFirst({
        where: { org_id: orgId },
      })

      if (!orgSettings?.blur_screenshots) {
        return { skipped: true, reason: 'blur_screenshots is disabled' }
      }

      // Dynamic S3 import to avoid circular deps at module load time
      const { getS3Client } = await import('../../lib/s3.js')
      const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3')

      const s3 = getS3Client(config)
      const bucket = config.S3_SCREENSHOT_BUCKET

      // Download from S3
      const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }))

      if (!getResult.Body) {
        throw new Error(`No body returned from S3 for key: ${s3Key}`)
      }

      const chunks: Uint8Array[] = []
      for await (const chunk of getResult.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      const originalBuffer = Buffer.concat(chunks)

      // Blur using sharp (Gaussian blur radius 20)
      const blurred = await sharp(originalBuffer).blur(20).toBuffer()

      // Re-upload blurred image
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: blurred,
          ContentType: getResult.ContentType ?? 'image/webp',
          ServerSideEncryption: 'aws:kms',
          ...(config.KMS_SCREENSHOT_KEY_ID && { SSEKMSKeyId: config.KMS_SCREENSHOT_KEY_ID }),
        })
      )

      // Mark as blurred in DB
      await prisma.screenshot.update({
        where: { id: screenshotId },
        data: { is_blurred: true },
      })

      return { blurred: true, screenshotId }
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 3,
    }
  )
}
