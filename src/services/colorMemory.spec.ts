import { describe, it, expect } from 'vitest'
import {
  MAX_DISTANCE,
  clampChannel,
  hslToRgb,
  randomColor,
  rating,
  redmeanDistance,
  scorePercent,
  type RGB,
} from './colorMemory'

describe('clampChannel', () => {
  it('rounds and clamps to 0-255', () => {
    expect(clampChannel(-5)).toBe(0)
    expect(clampChannel(300)).toBe(255)
    expect(clampChannel(127.6)).toBe(128)
  })
})

describe('hslToRgb', () => {
  it('maps known hues correctly', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual({ r: 255, g: 0, b: 0 }) // red
    expect(hslToRgb(120, 1, 0.5)).toEqual({ r: 0, g: 255, b: 0 }) // green
    expect(hslToRgb(240, 1, 0.5)).toEqual({ r: 0, g: 0, b: 255 }) // blue
    expect(hslToRgb(0, 0, 0.5)).toEqual({ r: 128, g: 128, b: 128 }) // gray
  })
})

describe('randomColor', () => {
  it('returns valid channels and is deterministic for an RNG', () => {
    const seq = [0.1, 0.6, 0.5]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const a = randomColor(rng)
    for (const v of [a.r, a.g, a.b]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
    i = 0
    expect(randomColor(rng)).toEqual(a)
  })
})

describe('redmeanDistance', () => {
  it('is zero for identical colors', () => {
    expect(redmeanDistance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(0)
  })
  it('is maximal for black vs white', () => {
    expect(redmeanDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(MAX_DISTANCE)
  })
})

describe('scorePercent', () => {
  const target: RGB = { r: 120, g: 60, b: 200 }
  it('is 100 for an exact match', () => {
    expect(scorePercent(target, { ...target })).toBe(100)
  })
  it('is 0 for the maximal-distance opposite', () => {
    expect(scorePercent({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBe(0)
  })
  it('rewards closer guesses with strictly higher scores', () => {
    const near = scorePercent(target, { r: 125, g: 65, b: 195 })
    const far = scorePercent(target, { r: 200, g: 200, b: 40 })
    expect(near).toBeGreaterThan(far)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThanOrEqual(100)
  })
})

describe('rating', () => {
  it('labels score tiers', () => {
    expect(rating(100)).toBe('Perfect!')
    expect(rating(85)).toBe('Great')
    expect(rating(10)).toBe('Way off')
  })
})
