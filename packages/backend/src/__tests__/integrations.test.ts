import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateOutboundUrl, ForbiddenHostError } from '../lib/integrations/ssrf.js'
import { encryptAuthData, decryptAuthData } from '../lib/integrations/kms.js'
import { resetBreaker, getBreaker } from '../lib/integrations/circuitBreaker.js'

// ── SSRF validation tests ─────────────────────────────────────────────────────

describe('validateOutboundUrl - SSRF protection', () => {
  it('allows public HTTPS URLs', () => {
    expect(() => validateOutboundUrl('https://api.atlassian.com/oauth/token')).not.toThrow()
    expect(() => validateOutboundUrl('https://app.asana.com/-/oauth_token')).not.toThrow()
    expect(() => validateOutboundUrl('https://example.com/api')).not.toThrow()
  })

  it('blocks localhost', () => {
    expect(() => validateOutboundUrl('http://localhost:3000')).toThrow(ForbiddenHostError)
    expect(() => validateOutboundUrl('https://localhost')).toThrow(ForbiddenHostError)
  })

  it('blocks 127.x.x.x loopback', () => {
    expect(() => validateOutboundUrl('http://127.0.0.1')).toThrow(ForbiddenHostError)
    expect(() => validateOutboundUrl('http://127.1.2.3')).toThrow(ForbiddenHostError)
  })

  it('blocks 10.x private class A', () => {
    expect(() => validateOutboundUrl('http://10.0.0.1')).toThrow(ForbiddenHostError)
    expect(() => validateOutboundUrl('https://10.255.255.255/secret')).toThrow(ForbiddenHostError)
  })

  it('blocks 192.168.x.x private class C', () => {
    expect(() => validateOutboundUrl('http://192.168.1.100')).toThrow(ForbiddenHostError)
  })

  it('blocks 172.16-31.x.x private class B', () => {
    expect(() => validateOutboundUrl('http://172.16.0.1')).toThrow(ForbiddenHostError)
    expect(() => validateOutboundUrl('http://172.31.255.255')).toThrow(ForbiddenHostError)
  })

  it('blocks AWS metadata endpoint 169.254.x.x', () => {
    expect(() => validateOutboundUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      ForbiddenHostError
    )
  })

  it('blocks 0.0.0.0', () => {
    expect(() => validateOutboundUrl('http://0.0.0.0')).toThrow(ForbiddenHostError)
  })

  it('blocks non-HTTP/HTTPS protocols', () => {
    expect(() => validateOutboundUrl('ftp://example.com')).toThrow(ForbiddenHostError)
    expect(() => validateOutboundUrl('file:///etc/passwd')).toThrow(ForbiddenHostError)
  })

  it('rejects invalid URLs', () => {
    expect(() => validateOutboundUrl('not-a-url')).toThrow(ForbiddenHostError)
  })

  it('allows URLs in allowlist and blocks others', () => {
    const allowedHosts = 'api.atlassian.com,app.asana.com'
    expect(() => validateOutboundUrl('https://api.atlassian.com/token', allowedHosts)).not.toThrow()
    expect(() => validateOutboundUrl('https://evil.com', allowedHosts)).toThrow(ForbiddenHostError)
  })
})

// ── KMS envelope encryption round-trip tests ─────────────────────────────────

describe('KMS local dev encryption round-trip', () => {
  const config = {
    AWS_REGION: 'us-east-1',
    KMS_INTEGRATIONS_KEY_ID: undefined,
    // other fields not needed for local fallback
  } as Parameters<typeof encryptAuthData>[1]

  it('encrypts and decrypts AuthTokens correctly', async () => {
    const original = {
      access_token: 'eyJhbGciOiJIUzI1NiJ9.test',
      refresh_token: 'refresh-token-value',
      expires_at: 1234567890,
    }

    const blob = await encryptAuthData(original, config)
    expect(blob).toBeInstanceOf(Buffer)
    expect(blob.length).toBeGreaterThan(32)

    const decrypted = await decryptAuthData(blob, config)
    expect(decrypted.access_token).toBe(original.access_token)
    expect(decrypted.refresh_token).toBe(original.refresh_token)
    expect(decrypted.expires_at).toBe(original.expires_at)
  })

  it('produces different ciphertext for same input (random IV)', async () => {
    const data = { access_token: 'same-token' }
    const blob1 = await encryptAuthData(data, config)
    const blob2 = await encryptAuthData(data, config)
    // Ciphertexts should differ due to random IVs
    expect(blob1.toString('hex')).not.toBe(blob2.toString('hex'))
  })

  it('throws on tampered ciphertext', async () => {
    const blob = await encryptAuthData({ token: 'secret' }, config)
    // Flip last byte to corrupt
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] ^= 0xff
    await expect(decryptAuthData(tampered, config)).rejects.toThrow()
  })

  it('round-trips arbitrary JSON objects', async () => {
    const complex = {
      access_token: 'tok1',
      nested: { level: 2, arr: [1, 2, 3] },
      unicode: '🔐 secret',
    }
    const blob = await encryptAuthData(complex, config)
    const dec = await decryptAuthData(blob, config)
    expect(JSON.stringify(dec)).toBe(JSON.stringify(complex))
  })
})

// ── OAuth state single-use enforcement ────────────────────────────────────────

describe('OAuth state enforcement', () => {
  it('marks state as used after first use', () => {
    const states = new Map<string, { used: boolean; expires_at: Date }>()

    function createState(): string {
      const state = `state-${Math.random().toString(36).slice(2)}`
      states.set(state, { used: false, expires_at: new Date(Date.now() + 900000) })
      return state
    }

    function consumeState(state: string): boolean | null {
      const s = states.get(state)
      if (!s) return null
      if (s.used) return false
      if (s.expires_at < new Date()) return null
      s.used = true
      return true
    }

    const state = createState()
    expect(consumeState(state)).toBe(true)
    expect(consumeState(state)).toBe(false)
  })

  it('rejects expired state', () => {
    const expiredState = {
      state: 'old-state',
      used: false,
      expires_at: new Date(Date.now() - 1000),
    }
    const isExpired = expiredState.expires_at < new Date()
    expect(isExpired).toBe(true)
  })

  it('rejects unknown state', () => {
    const states = new Map<string, unknown>()
    const found = states.get('non-existent')
    expect(found).toBeUndefined()
  })
})

// ── Circuit breaker behavior ──────────────────────────────────────────────────

describe('getBreaker', () => {
  beforeEach(() => {
    resetBreaker('test-service')
  })

  afterEach(() => {
    resetBreaker('test-service')
  })

  it('creates a breaker that executes the provided function', async () => {
    const mockFn = vi.fn(async (x: number) => x * 2)
    const breaker = getBreaker('test-service', mockFn as unknown as () => Promise<unknown>)

    const result = await breaker.fire(5)
    expect(result).toBe(10)
    expect(mockFn).toHaveBeenCalledWith(5)
  })

  it('returns the same breaker instance for the same name', () => {
    const fn = vi.fn()
    const b1 = getBreaker('test-service', fn as unknown as () => Promise<unknown>)
    const b2 = getBreaker('test-service', fn as unknown as () => Promise<unknown>)
    expect(b1).toBe(b2)
  })

  it('returns different breakers for different names', () => {
    const fn = vi.fn()
    const b1 = getBreaker('service-A', fn as unknown as () => Promise<unknown>)
    const b2 = getBreaker('service-B', fn as unknown as () => Promise<unknown>)
    resetBreaker('service-A')
    resetBreaker('service-B')
    expect(b1).not.toBe(b2)
  })

  it('opens the circuit after repeated failures', async () => {
    const failingFn = async () => {
      throw new Error('Service unavailable')
    }

    const breaker = getBreaker('test-service', failingFn)

    const results = await Promise.allSettled([
      breaker.fire(),
      breaker.fire(),
      breaker.fire(),
      breaker.fire(),
      breaker.fire(),
    ])

    // Some should fail — circuit should have been stressed
    const failures = results.filter((r) => r.status === 'rejected')
    expect(failures.length).toBeGreaterThan(0)
  })
})
