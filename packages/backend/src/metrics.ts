import { Registry, collectDefaultMetrics, Histogram } from 'prom-client'

const register = new Registry()
collectDefaultMetrics({ register })

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
})

export function getMetricsRegistry(): Registry {
  return register
}
