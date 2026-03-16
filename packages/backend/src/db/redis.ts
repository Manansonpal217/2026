import { Redis } from 'ioredis'
import type { Config } from '../config.js'

let redisInstance: Redis | null = null

export function getRedis(config: Config): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null
        return Math.min(times * 100, 3000)
      },
    })
    redisInstance.on('error', (err: Error) => console.error('Redis error:', err))
    redisInstance.on('connect', () => console.log('Redis connected'))
  }
  return redisInstance
}

export async function isJtiBlacklisted(client: Redis, jti: string): Promise<boolean> {
  const exists = await client.exists(`jti:blacklist:${jti}`)
  return exists === 1
}

export async function blacklistJti(client: Redis, jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds > 0) {
    await client.set(`jti:blacklist:${jti}`, '1', 'EX', ttlSeconds)
  }
}
