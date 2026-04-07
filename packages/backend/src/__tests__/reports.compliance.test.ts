import { describe, it, expect } from 'vitest'
import { idleScoreThresholdFromMinutes, parseIds } from '../lib/report-helpers.js'

describe('compliance report contracts', () => {
  it('idle score threshold stays within 1–99', () => {
    expect(idleScoreThresholdFromMinutes(200)).toBe(1)
    expect(idleScoreThresholdFromMinutes(0)).toBe(99)
  })

  it('parseIds normalizes string to single-element array', () => {
    expect(parseIds('only-one')).toEqual(['only-one'])
  })
})
