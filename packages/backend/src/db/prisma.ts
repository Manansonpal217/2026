import { PrismaClient } from '@prisma/client'

// Singleton Prisma client with tuned connection pool.
// connection_limit: 10 active + 10 idle for a typical backend.
// pool_timeout: 10s — fail fast instead of queuing forever.
// statement_timeout: 30s per query — kills runaway queries.
const DATABASE_URL = process.env.DATABASE_URL ?? ''

function buildDatabaseUrl(): string {
  try {
    const url = new URL(DATABASE_URL)
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '20')
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '10')
    }
    if (!url.searchParams.has('statement_timeout')) {
      url.searchParams.set('statement_timeout', '30000')
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '10')
    }
    return url.toString()
  } catch {
    return DATABASE_URL
  }
}

export const prisma = new PrismaClient({
  datasources: {
    db: { url: buildDatabaseUrl() },
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})
