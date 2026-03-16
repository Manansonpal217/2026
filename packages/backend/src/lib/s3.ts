import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Config } from '../config.js'

let s3Client: S3Client | null = null

export function getS3Client(config: Config): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.AWS_REGION || 'us-east-1',
      ...(config.AWS_ACCESS_KEY_ID && {
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
        },
      }),
    })
  }
  return s3Client
}

export async function uploadToS3(
  config: Config,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const s3 = getS3Client(config)
  await s3.send(
    new PutObjectCommand({
      Bucket: config.S3_SCREENSHOT_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: 'aws:kms',
      ...(config.KMS_SCREENSHOT_KEY_ID && {
        SSEKMSKeyId: config.KMS_SCREENSHOT_KEY_ID,
      }),
    }),
  )
}

export async function generateSignedUrl(
  config: Config,
  key: string,
  expiresIn = 900,
): Promise<string> {
  const s3 = getS3Client(config)
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.S3_SCREENSHOT_BUCKET,
      Key: key,
    }),
    { expiresIn },
  )
}

export async function generatePresignedPutUrl(
  config: Config,
  key: string,
  expiresIn = 600,
): Promise<string> {
  const s3 = getS3Client(config)
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.S3_SCREENSHOT_BUCKET,
      Key: key,
      ServerSideEncryption: 'aws:kms',
      ...(config.KMS_SCREENSHOT_KEY_ID && {
        SSEKMSKeyId: config.KMS_SCREENSHOT_KEY_ID,
      }),
    }),
    { expiresIn },
  )
}

export async function deleteFromS3(config: Config, key: string): Promise<void> {
  const s3 = getS3Client(config)
  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.S3_SCREENSHOT_BUCKET,
      Key: key,
    }),
  )
}

export async function objectExists(config: Config, key: string): Promise<boolean> {
  const s3 = getS3Client(config)
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: config.S3_SCREENSHOT_BUCKET,
        Key: key,
      }),
    )
    return true
  } catch {
    return false
  }
}
