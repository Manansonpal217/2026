import CircuitBreaker from 'opossum'

const breakers = new Map<string, CircuitBreaker>()

const DEFAULT_OPTIONS = {
  timeout: 10_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  volumeThreshold: 3,
}

export function getBreaker(name: string, fn: (...args: unknown[]) => Promise<unknown>): CircuitBreaker {
  if (!breakers.has(name)) {
    const breaker = new CircuitBreaker(fn, { ...DEFAULT_OPTIONS, name })
    breaker.on('open', () =>
      console.warn(`[CircuitBreaker] "${name}" opened — stopping requests`),
    )
    breaker.on('halfOpen', () =>
      console.info(`[CircuitBreaker] "${name}" half-open — testing`),
    )
    breaker.on('close', () => console.info(`[CircuitBreaker] "${name}" closed — recovered`))
    breakers.set(name, breaker)
  }
  return breakers.get(name)!
}

export function resetBreaker(name: string): void {
  breakers.delete(name)
}
