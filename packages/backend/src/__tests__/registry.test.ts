import { describe, it, expect, beforeAll } from 'vitest'
import { getAdapter, getRegistry, initAdapters } from '../lib/integrations/registry.js'

describe('integration registry', () => {
  beforeAll(async () => {
    await initAdapters()
  })

  it('registers jira and asana after initAdapters', () => {
    expect(getRegistry().has('jira')).toBe(true)
    expect(getRegistry().has('asana')).toBe(true)
  })

  it('getAdapter returns adapter for known provider', () => {
    expect(getAdapter('jira').type).toBe('jira')
  })

  it('getAdapter throws for unknown provider', () => {
    expect(() => getAdapter('unknown-provider')).toThrow()
    try {
      getAdapter('unknown-provider')
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string }
      expect(err.statusCode).toBe(503)
      expect(err.code).toBe('INTEGRATION_NOT_CONFIGURED')
    }
  })
})
