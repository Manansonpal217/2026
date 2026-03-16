import { describe, it, expect } from 'vitest'
import {
  computeActivityScore,
  DEFAULT_WEIGHTS,
  DEFAULT_BASELINE,
  type ActivityInputs,
} from '../main/activity/scorer.js'

describe('computeActivityScore', () => {
  it('returns 0 for zero duration', () => {
    const inputs: ActivityInputs = { keyboardEvents: 100, mouseClicks: 20, mouseDistancePx: 5000 }
    expect(computeActivityScore(inputs, 0)).toBe(0)
  })

  it('returns 0 for zero inputs', () => {
    expect(computeActivityScore({ keyboardEvents: 0, mouseClicks: 0, mouseDistancePx: 0 }, 1)).toBe(0)
  })

  it('returns 100 for inputs at exact baseline', () => {
    const inputs: ActivityInputs = {
      keyboardEvents: DEFAULT_BASELINE.keyboardPerMin,
      mouseClicks: DEFAULT_BASELINE.clicksPerMin,
      mouseDistancePx: DEFAULT_BASELINE.distancePxPerMin,
    }
    const score = computeActivityScore(inputs, 1)
    // Weights sum to 1 and all normalized to 1.0 → score = 100
    expect(score).toBe(100)
  })

  it('clamps above-baseline inputs to max score', () => {
    const inputs: ActivityInputs = {
      keyboardEvents: DEFAULT_BASELINE.keyboardPerMin * 10,
      mouseClicks: DEFAULT_BASELINE.clicksPerMin * 10,
      mouseDistancePx: DEFAULT_BASELINE.distancePxPerMin * 10,
    }
    const score = computeActivityScore(inputs, 1)
    expect(score).toBe(100)
  })

  it('scales correctly with duration (2 minutes)', () => {
    const inputs: ActivityInputs = {
      keyboardEvents: DEFAULT_BASELINE.keyboardPerMin * 2,
      mouseClicks: DEFAULT_BASELINE.clicksPerMin * 2,
      mouseDistancePx: DEFAULT_BASELINE.distancePxPerMin * 2,
    }
    const score = computeActivityScore(inputs, 2)
    expect(score).toBe(100)
  })

  it('produces ~50 score for half-baseline inputs', () => {
    const inputs: ActivityInputs = {
      keyboardEvents: DEFAULT_BASELINE.keyboardPerMin / 2,
      mouseClicks: DEFAULT_BASELINE.clicksPerMin / 2,
      mouseDistancePx: DEFAULT_BASELINE.distancePxPerMin / 2,
    }
    const score = computeActivityScore(inputs, 1)
    expect(score).toBe(50)
  })

  it('is always in range [0, 100]', () => {
    const cases: Array<[ActivityInputs, number]> = [
      [{ keyboardEvents: 0, mouseClicks: 0, mouseDistancePx: 0 }, 1],
      [{ keyboardEvents: 9999, mouseClicks: 9999, mouseDistancePx: 9999999 }, 10],
      [{ keyboardEvents: 50, mouseClicks: 10, mouseDistancePx: 2500 }, 5],
    ]
    for (const [inputs, duration] of cases) {
      const score = computeActivityScore(inputs, duration)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('respects custom weights', () => {
    const keyboardOnly = { keyboard: 1, mouse: 0, movement: 0 }
    const inputs: ActivityInputs = {
      keyboardEvents: DEFAULT_BASELINE.keyboardPerMin,
      mouseClicks: 0,
      mouseDistancePx: 0,
    }
    const score = computeActivityScore(inputs, 1, DEFAULT_BASELINE, keyboardOnly)
    expect(score).toBe(100)
  })

  it('ignores keyboard if weight is 0', () => {
    const noKeyboard = { keyboard: 0, mouse: 0.5, movement: 0.5 }
    const inputs: ActivityInputs = {
      keyboardEvents: 999999,
      mouseClicks: 0,
      mouseDistancePx: 0,
    }
    const score = computeActivityScore(inputs, 1, DEFAULT_BASELINE, noKeyboard)
    expect(score).toBe(0)
  })
})
