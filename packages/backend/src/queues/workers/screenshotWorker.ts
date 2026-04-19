import { Worker } from 'bullmq'
import sharp from 'sharp'
import type { Config } from '../../config.js'
import { prisma } from '../../db/prisma.js'

interface ScreenshotJobData {
  screenshotId: string
  s3Key: string
  orgId: string
  /** Manual blur from dashboard — blur even if OrgSettings.blur_screenshots is false */
  forceBlur?: boolean
}

export function screenshotWorker(config: Config): Worker {
  return new Worker<ScreenshotJobData>(
    'screenshot-processing',
    async (job) => {
      const { screenshotId, s3Key, orgId } = job.data

      const orgSettings = await prisma.orgSettings.findFirst({
        where: { org_id: orgId },
      })

      const forceBlur = job.data.forceBlur === true
      // Org must allow blur for automated jobs; confirm() only enqueues when org blur is on and user opted in. Manual blur uses forceBlur.
      if (!forceBlur && !orgSettings?.blur_screenshots) {
        return { skipped: true, reason: 'blur_screenshots is disabled' }
      }

      // Dynamic S3 import to avoid circular deps at module load time
      const { getS3Client, isR2 } = await import('../../lib/s3.js')
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

      const kmsPut = !isR2(config)
        ? ({
            ServerSideEncryption: 'aws:kms' as const,
            ...(config.KMS_SCREENSHOT_KEY_ID && { SSEKMSKeyId: config.KMS_SCREENSHOT_KEY_ID }),
          } as const)
        : ({} as const)

      // Re-upload blurred image (omit KMS for R2)
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: blurred,
          ContentType: getResult.ContentType ?? 'image/webp',
          ...kmsPut,
        })
      )

      const row = await prisma.screenshot.findUnique({
        where: { id: screenshotId },
        select: { thumb_s3_key: true },
      })
      if (row?.thumb_s3_key) {
        const thumbBuf = await sharp(blurred)
          .resize({ width: 320, withoutEnlargement: true })
          .webp({ quality: 65 })
          .toBuffer()
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: row.thumb_s3_key,
            Body: thumbBuf,
            ContentType: 'image/webp',
            ...kmsPut,
          })
        )
      }

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
