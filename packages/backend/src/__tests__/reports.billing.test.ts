import { describe, it, expect } from 'vitest'
import { reportMeta } from '../lib/report-helpers.js'

describe('billing report contracts', () => {
  it('reportMeta omits total when not provided', () => {
    const meta = reportMeta('2025-01-01T00:00:00.000Z', '2025-01-31T00:00:00.000Z')
    expect(meta).toEqual({
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-01-31T00:00:00.000Z',
    })
    expect('total' in meta).toBe(false)
  })
})
