import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { Config } from '../../config.js'

/**
 * KMS envelope encryption for integration OAuth tokens.
 *
 * When KMS_INTEGRATIONS_KEY_ID is configured, uses AWS KMS GenerateDataKey
 * for true envelope encryption. In dev (no KMS), falls back to local AES-256-GCM
 * with a key derived from the DB_ENCRYPTION_KEY env var.
 *
 * Wire format:
 *   [4 bytes: encryptedDataKeyLen][encryptedDataKey][12 bytes: iv][16 bytes: authTag][ciphertext]
 */

const LOCAL_KEY_LEN = 32 // 256-bit

const DEV_FALLBACK_KEY_HEX = '0000000000000000000000000000000000000000000000000000000000000001'

async function getLocalKey(config: Config): Promise<Buffer> {
  // In dev without KMS, derive a 32-byte key from a hex env var
  const keyHex = process.env.DB_ENCRYPTION_KEY ?? DEV_FALLBACK_KEY_HEX
  // Ensure exactly 64 hex chars (32 bytes)
  const normalised = keyHex.replace(/[^0-9a-fA-F]/g, '0').padEnd(64, '0').slice(0, 64)
  return Buffer.from(normalised, 'hex')
}

export async function encryptAuthData(
  data: object,
  config: Config,
): Promise<Buffer> {
  const plaintext = Buffer.from(JSON.stringify(data), 'utf-8')

  if (config.KMS_INTEGRATIONS_KEY_ID) {
    const { KMSClient, GenerateDataKeyCommand } = await import('@aws-sdk/client-kms')
    const kms = new KMSClient({ region: config.AWS_REGION })

    const { Plaintext, CiphertextBlob } = await kms.send(
      new GenerateDataKeyCommand({
        KeyId: config.KMS_INTEGRATIONS_KEY_ID,
        KeySpec: 'AES_256',
      }),
    )

    const dataKey = Buffer.from(Plaintext!)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()
    const encryptedDataKey = Buffer.from(CiphertextBlob!)

    const lenBuf = Buffer.allocUnsafe(4)
    lenBuf.writeUInt32BE(encryptedDataKey.length, 0)
    return Buffer.concat([lenBuf, encryptedDataKey, iv, authTag, encrypted])
  }

  // Local dev fallback
  const key = await getLocalKey(config)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(0, 0)
  return Buffer.concat([lenBuf, iv, authTag, encrypted])
}

import type { AuthTokens } from './adapter.js'

export async function decryptAuthData(
  blob: Buffer,
  config: Config,
): Promise<AuthTokens> {
  const encryptedKeyLen = blob.readUInt32BE(0)
  let offset = 4

  let dataKey: Buffer

  if (encryptedKeyLen > 0) {
    const encryptedDataKey = blob.subarray(offset, offset + encryptedKeyLen)
    offset += encryptedKeyLen

    const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms')
    const kms = new KMSClient({ region: config.AWS_REGION })
    const { Plaintext } = await kms.send(new DecryptCommand({ CiphertextBlob: encryptedDataKey }))
    dataKey = Buffer.from(Plaintext!)
  } else {
    dataKey = await getLocalKey(config)
  }

  const iv = blob.subarray(offset, offset + 12)
  offset += 12
  const authTag = blob.subarray(offset, offset + 16)
  offset += 16
  const ciphertext = blob.subarray(offset)

  const decipher = createDecipheriv('aes-256-gcm', dataKey, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

  return JSON.parse(decrypted.toString('utf-8')) as AuthTokens
}
