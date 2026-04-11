import { randomUUID } from 'crypto'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import compress from '@fastify/compress'
import underPressure from '@fastify/under-pressure'
import * as Sentry from '@sentry/node'
import { loadConfig } from './config.js'
import { initJwtKeys, verifyToken } from './lib/jwt.js'
import { initAdapters } from './lib/integrations/registry.js'
import { getRedis } from './db/redis.js'
import { prisma } from './db/prisma.js'
import { initQueues, startWorkers, scheduleRepeatableJobs } from './queues/index.js'
import { v1Routes } from './routes/v1.js'
import { getMetricsRegistry, httpRequestDurationSeconds } from './metrics.js'

const reqStartNs = new WeakMap<object, bigint>()

async function main() {
  const config = loadConfig()
  const isDev = config.NODE_ENV === 'development'
  const isProd = config.NODE_ENV === 'production'

  if (config.SENTRY_DSN) {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV,
      tracesSampleRate: isProd ? 0.1 : 0,
    })
  }

  await initJwtKeys(config.JWT_PRIVATE_KEY, config.JWT_PUBLIC_KEY, {
    requirePersistentKeys: isProd,
  })
  initQueues(config)
  await initAdapters()

  const fastify = Fastify({
    genReqId: () => randomUUID(),
    logger: isDev
      ? false
      : {
          level: 'info',
          serializers: {
            req: (req) => ({
              method: req.method,
              url: req.url,
              id: req.id,
            }),
            res: (res) => ({ statusCode: res.statusCode }),
          },
        },
    keepAliveTimeout: 65_000,
    connectionTimeout: 10_000,
    trustProxy: true,
  })

  await fastify.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  })

  await fastify.register(underPressure, {
    maxEventLoopDelay: 1500,
    maxHeapUsedBytes: 900 * 1024 * 1024,
    message: 'Service temporarily overloaded — please retry shortly.',
    exposeStatusRoute: false,
  })

  await fastify.register(cors, {
    origin: isDev
      ? [
          'http://localhost:3000',
          'http://localhost:3002',
          'http://localhost:5173',
          'http://localhost:5174',
        ]
      : config.APP_URL.split(',').map((u) => u.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  })

  await fastify.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: isDev
      ? false
      : { maxAge: 31536000, includeSubDomains: true, preload: false },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  })

  await fastify.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    redis: getRedis(config),
    keyGenerator: async (request) => {
      const auth = request.headers.authorization
      const raw = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null
      if (raw) {
        try {
          const payload = await verifyToken(raw)
          return `org:${payload.org_id}`
        } catch {
          /* invalid/expired/MFA-pending token — fall back to IP */
        }
      }
      return `ip:${request.ip}`
    },
  })

  fastify.addHook('onRequest', async (request) => {
    reqStartNs.set(request.raw, process.hrtime.bigint())
  })

  fastify.addHook('onResponse', async (request, reply) => {
    const start = reqStartNs.get(request.raw)
    reqStartNs.delete(request.raw)
    if (!start) return
    const seconds = Number(process.hrtime.bigint() - start) / 1e9
    const routeTemplate =
      'routeOptions' in request && request.routeOptions && typeof request.routeOptions === 'object'
        ? String((request.routeOptions as { url?: string }).url ?? request.url.split('?')[0])
        : (request.url.split('?')[0] ?? 'unknown')
    try {
      httpRequestDurationSeconds
        .labels(request.method, routeTemplate, String(reply.statusCode))
        .observe(seconds)
    } catch {
      /* histogram may throw on label cardinality in edge cases */
    }
  })

  fastify.setErrorHandler((err, request, reply) => {
    if (reply.sent) return
    const error = err as { statusCode?: number; message?: string; code?: string }
    const statusCode = error.statusCode ?? 500
    if (statusCode >= 500 || !Number.isInteger(statusCode)) {
      if (config.SENTRY_DSN) {
        Sentry.captureException(err, { extra: { url: request.url, method: request.method } })
      }
      fastify.log?.warn({ err }, 'Unhandled error')
      return reply.status(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      })
    }
    const message =
      error.message && typeof error.message === 'string' ? error.message : 'Bad request'
    return reply.status(statusCode).send({ code: error.code ?? 'ERROR', message })
  })

  async function checkReady(): Promise<{
    db: 'ok' | 'error'
    redis: 'ok' | 'error'
  }> {
    const db = await prisma.$queryRaw`SELECT 1`
      .then(() => 'ok' as const)
      .catch(() => 'error' as const)
    let redis: 'ok' | 'error' = 'error'
    try {
      await getRedis(config).ping()
      redis = 'ok'
    } catch {
      redis = 'error'
    }
    return { db, redis }
  }

  fastify.get('/health/live', async () => ({
    status: 'ok',
    version: config.APP_VERSION,
  }))

  fastify.get('/health/ready', async (_request, reply) => {
    const { db, redis: rs } = await checkReady()
    if (db !== 'ok' || rs !== 'ok') {
      return reply.status(503).send({
        status: 'not_ready',
        version: config.APP_VERSION,
        db,
        redis: rs,
      })
    }
    return { status: 'ok', version: config.APP_VERSION, db, redis: rs }
  })

  /** @deprecated Prefer /health/ready for probes; kept for older monitors. */
  fastify.get('/health', async (_request, reply) => {
    const { db, redis: rs } = await checkReady()
    if (db !== 'ok' || rs !== 'ok') {
      return reply.status(503).send({
        status: 'not_ready',
        version: config.APP_VERSION,
        db,
        redis: rs,
      })
    }
    return { status: 'ok', version: config.APP_VERSION, db, redis: rs }
  })

  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', getMetricsRegistry().contentType)
    return reply.send(await getMetricsRegistry().metrics())
  })

  await fastify.register(v1Routes, { prefix: '/v1', config })

  await prisma.$connect()
  const redis = getRedis(config)
  await redis.ping()

  await startWorkers(config)
  await scheduleRepeatableJobs()

  const port = config.PORT
  await fastify.listen({ port, host: '0.0.0.0' })
  console.log(`Backend running at http://localhost:${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
