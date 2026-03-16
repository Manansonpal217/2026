import { PrismaClient } from '@prisma/client'

let _dbRead: PrismaClient | null = null

/**
 * Read-replica Prisma client for reporting queries.
 * Falls back to the primary DB if DATABASE_READ_URL is not set.
 */
export function getDbRead(): PrismaClient {
  if (!_dbRead) {
    _dbRead = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_READ_URL ?? process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }
  return _dbRead
}

export const dbRead = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getDbRead() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
