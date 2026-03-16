import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import compress from '@fastify/compress'
import { loadConfig } from './config.js'
import { initJwtKeys } from './lib/jwt.js'
import { getRedis } from './db/redis.js'
import { prisma } from './db/prisma.js'
import { v1Routes } from './routes/v1.js'

async function main() {
  const config = loadConfig()
  const isDev = config.NODE_ENV === 'development'

  await initJwtKeys(config.JWT_PRIVATE_KEY, config.JWT_PUBLIC_KEY)

  const fastify = Fastify({
    // Disable logger in dev for speed; use structured logging in prod
    logger: isDev
      ? false
      : {
          level: 'warn',
          serializers: {
            req: (req) => ({ method: req.method, url: req.url }),
            res: (res) => ({ statusCode: res.statusCode }),
          },
        },
    // Keep-alive connections for upstream proxies / internal traffic
    keepAliveTimeout: 65_000,
    connectionTimeout: 10_000,
    // Trust X-Forwarded-* headers if behind a reverse proxy
    trustProxy: true,
  })

  // Gzip/Brotli compression — negligible CPU cost, big bandwidth savings
  await fastify.register(compress, {
    global: true,
    threshold: 1024, // only compress responses > 1KB
    encodings: ['br', 'gzip', 'deflate'],
  })

  await fastify.register(cors, {
    // Explicit allowlist instead of origin: true (security + slight perf gain)
    origin: isDev
      ? ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174']
      : [config.APP_URL],
    credentials: true,
  })

  await fastify.register(helmet, { contentSecurityPolicy: false })

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    // Use Redis for distributed rate limiting when scaling horizontally
    redis: getRedis(config),
  })

  fastify.get('/health', async () => ({
    status: 'ok',
    version: config.APP_VERSION,
    db: await prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'error'),
  }))

  await fastify.register(v1Routes, { prefix: '/v1', config })

  // Warm up database connection pool on startup
  await prisma.$connect()

  const redis = getRedis(config)
  await redis.ping()

  const port = config.PORT
  await fastify.listen({ port, host: '0.0.0.0' })
  console.log(`Backend running at http://localhost:${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
