export interface ActivityWeights {
  keyboard: number
  mouse: number
  movement: number
}

export const DEFAULT_WEIGHTS: ActivityWeights = {
  keyboard: 0.5,
  mouse: 0.3,
  movement: 0.2,
}

export interface ActivityInputs {
  keyboardEvents: number
  mouseClicks: number
  mouseDistancePx: number
}

export interface ActivityBaseline {
  keyboardPerMin: number
  clicksPerMin: number
  distancePxPerMin: number
}

export const DEFAULT_BASELINE: ActivityBaseline = {
  keyboardPerMin: 100,
  clicksPerMin: 20,
  distancePxPerMin: 5000,
}

/**
 * Compute an activity score (0–100) from raw input counters.
 *
 * Each input type is clamped to [0, baseline] and normalized to [0, 1],
 * then weighted and summed to produce a final score.
 *
 * @param inputs     Raw input counters for the measurement window
 * @param baseline   Expected maximum values per minute
 * @param durationMin Duration of the measurement window in minutes
 * @param weights    Relative importance of each input type (must sum to 1)
 */
export function computeActivityScore(
  inputs: ActivityInputs,
  durationMin: number,
  baseline: ActivityBaseline = DEFAULT_BASELINE,
  weights: ActivityWeights = DEFAULT_WEIGHTS,
): number {
  if (durationMin <= 0) return 0

  const maxKeyboard = baseline.keyboardPerMin * durationMin
  const maxClicks = baseline.clicksPerMin * durationMin
  const maxDistance = baseline.distancePxPerMin * durationMin

  const normKeyboard = maxKeyboard > 0 ? Math.min(inputs.keyboardEvents / maxKeyboard, 1) : 0
  const normClicks = maxClicks > 0 ? Math.min(inputs.mouseClicks / maxClicks, 1) : 0
  const normDistance = maxDistance > 0 ? Math.min(inputs.mouseDistancePx / maxDistance, 1) : 0

  const score =
    normKeyboard * weights.keyboard +
    normClicks * weights.mouse +
    normDistance * weights.movement

  return Math.round(Math.min(score, 1) * 100)
}
