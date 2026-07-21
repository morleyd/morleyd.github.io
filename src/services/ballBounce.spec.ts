import { describe, it, expect } from 'vitest'
import {
  BALL_RADIUS,
  BASE_SPACING,
  BOUNCE_VY,
  GRAVITY,
  MAX_BOUNCES,
  MAX_SPACING,
  type Ball,
  type Platform,
  bounceReach,
  nearestPlatformIndex,
  platformAt,
  platformBroken,
  platformY,
  spacingBefore,
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

describe('tryBounce (top-surface only)', () => {
  const plat: Platform = { x: 0.5, y: 10, width: 0.26 }
  it('bounces a falling ball that lands on the platform top', () => {
    const ball: Ball = { x: 0.5, y: 9.98, vx: 0, vy: -3 }
    const bounced = tryBounce(ball, 10.05, plat)
    expect(bounced).not.toBeNull()
    expect(bounced!.vy).toBe(BOUNCE_VY)
    expect(bounced!.y).toBeCloseTo(plat.y + BALL_RADIUS) // seated on the surface
  })
  it('does not bounce while moving up (rising through from below)', () => {
    expect(tryBounce({ x: 0.5, y: 10, vx: 0, vy: 3 }, 9.9, plat)).toBeNull()
  })
  it('does not bounce when horizontally off the platform (no side bounce)', () => {
    const ball: Ball = { x: 0.9, y: 9.98, vx: 0, vy: -3 }
    expect(tryBounce(ball, 10.05, plat)).toBeNull()
  })
  it('does not bounce from underneath: falling while already below the surface', () => {
    // Ball started below the surface and stays below — never crossed the top.
    const ball: Ball = { x: 0.5, y: 8, vx: 0, vy: -3 }
    expect(tryBounce(ball, 8.1, plat)).toBeNull()
  })
  it('catches a fast fall that would tunnel through in one step', () => {
    const ball: Ball = { x: 0.5, y: 9.9, vx: 0, vy: -30 }
    expect(tryBounce(ball, 10.4, plat)).not.toBeNull()
  })
})

describe('bounce reach (climbing is reliable)', () => {
  it('overshoots the widest shelf gap so the next shelf is always reachable', () => {
    // A bounce must rise higher than the largest spacing, or you could never
    // land on the shelf above.
    expect(bounceReach()).toBeGreaterThan(MAX_SPACING)
  })
  it('bounceReach equals v^2 / 2g', () => {
    expect(bounceReach()).toBeCloseTo((BOUNCE_VY * BOUNCE_VY) / (2 * GRAVITY))
  })
  it('simulating a real bounce peaks above the max spacing', () => {
    let ball: Ball = { x: 0.5, y: 0, vx: 0, vy: BOUNCE_VY }
    let peak = ball.y
    for (let i = 0; i < 400 && ball.vy > 0; i += 1) {
      ball = stepBall(ball, 0, 16)
      if (ball.y > peak) peak = ball.y
    }
    expect(peak).toBeGreaterThan(MAX_SPACING)
  })
})

describe('spacing ramp (difficulty increases with height)', () => {
  it('shelves get further apart as you climb, up to a cap', () => {
    expect(spacingBefore(1)).toBeCloseTo(BASE_SPACING)
    expect(spacingBefore(5)).toBeGreaterThan(spacingBefore(1))
    expect(spacingBefore(50)).toBeGreaterThan(spacingBefore(5))
    // Never exceeds the cap (and the cap stays below the bounce reach).
    expect(spacingBefore(500)).toBeCloseTo(MAX_SPACING)
    expect(MAX_SPACING).toBeLessThan(bounceReach())
  })
  it('platformY is strictly increasing and matches accumulated spacing', () => {
    expect(platformY(0)).toBe(0)
    let acc = 0
    for (let i = 1; i < 200; i += 1) {
      acc += spacingBefore(i)
      expect(platformY(i)).toBeGreaterThan(platformY(i - 1))
      expect(platformY(i) - platformY(i - 1)).toBeCloseTo(spacingBefore(i))
      expect(platformY(i)).toBeCloseTo(acc)
    }
  })
})

describe('platformAt', () => {
  it('is deterministic, in-bounds, and follows platformY', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = platformAt(42, i)
      expect(platformAt(42, i)).toEqual(p)
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0)
      expect(p.x + p.width / 2).toBeLessThanOrEqual(1)
      expect(p.y).toBeCloseTo(platformY(i))
    }
  })
})

describe('nearestPlatformIndex', () => {
  it('inverts platformY (round-trips shelf indices)', () => {
    for (const i of [0, 1, 2, 5, 13, 14, 30, 100]) {
      expect(nearestPlatformIndex(platformY(i))).toBe(i)
    }
  })
  it('never returns a negative index', () => {
    expect(nearestPlatformIndex(-5)).toBe(0)
  })
})

describe('platformBroken (shelves vanish after a couple of bounces)', () => {
  it('breaks once bounced MAX_BOUNCES times', () => {
    expect(MAX_BOUNCES).toBe(2)
    expect(platformBroken(0)).toBe(false)
    expect(platformBroken(1)).toBe(false)
    expect(platformBroken(2)).toBe(true)
    expect(platformBroken(3)).toBe(true)
  })
  it('a shelf you keep landing on breaks after MAX_BOUNCES bounces', () => {
    // Mirrors the view: count bounces per shelf and stop once broken.
    let count = 0
    const bounceOnce = () => {
      if (platformBroken(count)) return false // gone — cannot bounce again
      count += 1
      return true
    }
    for (let i = 0; i < MAX_BOUNCES; i += 1) expect(bounceOnce()).toBe(true)
    expect(platformBroken(count)).toBe(true)
    expect(bounceOnce()).toBe(false) // no infinite bouncing on one shelf
  })
})

describe('BALL_RADIUS sanity', () => {
  it('is small enough to fit between shelves', () => {
    expect(BALL_RADIUS * 2).toBeLessThan(BASE_SPACING)
  })
})
