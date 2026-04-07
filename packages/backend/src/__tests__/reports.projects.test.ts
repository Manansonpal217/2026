import { describe, it, expect } from 'vitest'
import { parseIds, reportMeta } from '../lib/report-helpers.js'

describe('projects report contracts', () => {
  it('reportMeta serializes dates consistently', () => {
    const meta = reportMeta('2025-03-01T00:00:00.000Z', '2025-03-15T00:00:00.000Z', 0)
    expect(meta.from).toBe('2025-03-01T00:00:00.000Z')
    expect(meta.to).toBe('2025-03-15T00:00:00.000Z')
    expect(meta.total).toBe(0)
  })

  it('parseIds returns undefined for undefined input', () => {
    expect(parseIds(undefined)).toBeUndefined()
  })
})
