import { describe, it, expect } from 'vitest'
import { parseIds, reportMeta } from '../lib/report-helpers.js'

describe('attendance report contracts', () => {
  it('reportMeta exposes stable keys for date-range reports', () => {
    const from = new Date('2025-06-01T00:00:00.000Z')
    const to = new Date('2025-06-30T23:59:59.999Z')
    const meta = reportMeta(from, to, 42)
    expect(Object.keys(meta).sort()).toEqual(['from', 'to', 'total'])
    expect(meta.total).toBe(42)
  })

  it('parseIds handles array input', () => {
    expect(parseIds(['a', 'b'])).toEqual(['a', 'b'])
  })
})
