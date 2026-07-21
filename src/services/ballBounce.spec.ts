import { describe, it, expect } from 'vitest'
import {
  BALL_RADIUS,
  BOUNCE_VY,
  PLATFORM_SPACING,
  type Ball,
  type Platform,
  nearestPlatformIndex,
  platformAt,
  stepBall,
  tryBounce,
  wrapDist,
} from './ballBounce'

describe('stepBall', () => {
  it('applies gravity (vy decreases) and steers horizontally', () => {
    const next = stepBall({ x: 0.5, y: 5, vx: 0, vy: 2 }, 1, 16)
    expect(next.vy).toBeLessThan(2)
    expect(next.x).toBeGreaterThan(0.5)
  })
  it('wraps horizontally past the edges', () => {
    expect(stepBall({ x: 0.99, y: 0, vx: 0, vy: 0 }, 1, 100).x).toBeLessThan(0.5)
    expect(stepBall({ x: 0.01, y: 0, vx: 0, vy: 0 }, -1, 100).x).toBeGreaterThan(0.5)
  })
})

describe('wrapDist', () => {
  it('measures the shorter way around', () => {
    expect(wrapDist(0.1, 0.2)).toBeCloseTo(0.1)
    expect(wrapDist(0.05, 0.95)).toBeCloseTo(0.1) // across the seam
  })
})

describe('tryBounce', () => {
  const plat: Platform = { x: 0.5, y: 10, width: 0.26 }
  it('bounces a falling ball that crosses the platform top', () => {
    const ball: Ball = { x: 0.5, y: 9.98, vx: 0, vy: -3 }
    const bounced = tryBounce(ball, 10.05, plat)
    expect(bounced).not.toBeNull()
    expect(bounced!.vy).toBe(BOUNCE_VY)
  })
  it('does not bounce while moving up', () => {
    expect(tryBounce({ x: 0.5, y: 10, vx: 0, vy: 3 }, 9.9, plat)).toBeNull()
  })
  it('does not bounce when horizontally off the platform', () => {
    const ball: Ball = { x: 0.9, y: 9.98, vx: 0, vy: -3 }
    expect(tryBounce(ball, 10.05, plat)).toBeNull()
  })
  it('does not bounce without crossing the surface (no tunneling false-positive)', () => {
    // Ball already well below the platform and staying below.
    const ball: Ball = { x: 0.5, y: 8, vx: 0, vy: -3 }
    expect(tryBounce(ball, 8.1, plat)).toBeNull()
  })
  it('catches a fast fall that would tunnel through in one step', () => {
    // prevY above, ball now below surface by more than a radius — still bounces
    // because it crossed the surface this step.
    const ball: Ball = { x: 0.5, y: 9.9, vx: 0, vy: -30 }
    expect(tryBounce(ball, 10.4, plat)).not.toBeNull()
  })
})

describe('platformAt', () => {
  it('is deterministic and in-bounds', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = platformAt(42, i)
      expect(platformAt(42, i)).toEqual(p)
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0)
      expect(p.x + p.width / 2).toBeLessThanOrEqual(1)
      expect(p.y).toBeCloseTo(i * PLATFORM_SPACING)
    }
  })
})

describe('nearestPlatformIndex', () => {
  it('rounds y to the closest platform index', () => {
    expect(nearestPlatformIndex(0)).toBe(0)
    expect(nearestPlatformIndex(PLATFORM_SPACING * 3 + 0.1)).toBe(3)
  })
})

describe('BALL_RADIUS sanity', () => {
  it('is small enough to fit between platforms', () => {
    expect(BALL_RADIUS * 2).toBeLessThan(PLATFORM_SPACING)
  })
})
