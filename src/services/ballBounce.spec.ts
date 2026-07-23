import { describe, it, expect } from 'vitest'
import {
  BALL_RADIUS,
  BASE_SPACING,
  BOUNCE_VY,
  GRAVITY,
  KIND_BOUNCE,
  MAX_BOUNCES,
  MAX_SPACING,
  MOVE_VX,
  Y_JITTER,
  Y_TO_X,
  type Ball,
  type Platform,
  bounceOffBumper,
  bounceReach,
  bumperAt,
  gapAbove,
  heightScore,
  nearestPlatformIndex,
  platformAt,
  platformBroken,
  platformKindAt,
  platformY,
  platformYAt,
  spacingBefore,
  stepBall,
  trackMaxHeight,
  tryBounce,
  wrapDelta,
  wrapDist,
} from './ballBounce'

describe('stepBall', () => {
  it('applies gravity (vy decreases) and steers horizontally', () => {
    const next = stepBall({ x: 0.5, y: 5, vx: 0, vy: 2 }, 1, 16)
    expect(next.vy).toBeLessThan(2)
    expect(next.x).toBeGreaterThan(0.5)
  })
  it('wraps horizontally past the edges', () => {
    expect(stepBall({ x: 0.99, y: 0, vx: MOVE_VX, vy: 0 }, 1, 100).x).toBeLessThan(0.5)
    expect(stepBall({ x: 0.01, y: 0, vx: -MOVE_VX, vy: 0 }, -1, 100).x).toBeGreaterThan(0.5)
  })
  it('eases vx toward the steering target instead of snapping (smooth control)', () => {
    const one = stepBall({ x: 0.5, y: 0, vx: 0, vy: 0 }, 1, 16)
    expect(one.vx).toBeGreaterThan(0)
    expect(one.vx).toBeLessThan(MOVE_VX) // not instantly at full speed
    // Held long enough, it converges to the full steering speed.
    let ball: Ball = { x: 0.5, y: 0, vx: 0, vy: 0 }
    for (let i = 0; i < 60; i += 1) ball = stepBall(ball, 1, 16)
    expect(ball.vx).toBeCloseTo(MOVE_VX, 2)
  })
  it('accepts analog steer values between -1 and 1', () => {
    let ball: Ball = { x: 0.5, y: 0, vx: 0, vy: 0 }
    for (let i = 0; i < 60; i += 1) ball = stepBall(ball, 0.5, 16)
    expect(ball.vx).toBeCloseTo(MOVE_VX * 0.5, 2)
  })
})

describe('wrapDist / wrapDelta', () => {
  it('measures the shorter way around', () => {
    expect(wrapDist(0.1, 0.2)).toBeCloseTo(0.1)
    expect(wrapDist(0.05, 0.95)).toBeCloseTo(0.1) // across the seam
  })
  it('wrapDelta is signed and takes the short way', () => {
    expect(wrapDelta(0.1, 0.3)).toBeCloseTo(0.2)
    expect(wrapDelta(0.95, 0.05)).toBeCloseTo(0.1)
    expect(wrapDelta(0.05, 0.95)).toBeCloseTo(-0.1)
  })
})

describe('tryBounce (top-surface only)', () => {
  const plat: Platform = { x: 0.5, y: 10, width: 0.26, kind: 'normal' }
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
  it('scales the bounce by the shelf kind (springs launch higher, crumblers less)', () => {
    const ball: Ball = { x: 0.5, y: 9.98, vx: 0, vy: -3 }
    for (const kind of ['super', 'rocket', 'crumble', 'fading'] as const) {
      const bounced = tryBounce(ball, 10.05, { ...plat, kind })
      expect(bounced!.vy).toBeCloseTo(BOUNCE_VY * KIND_BOUNCE[kind])
    }
  })
})

describe('bounce reach (climbing is always solvable)', () => {
  it('a normal bounce overshoots the worst-case shelf gap', () => {
    // Worst gap: the capped spacing plus jitter pushing the shelves apart.
    expect(bounceReach('normal')).toBeGreaterThan(MAX_SPACING + 2 * Y_JITTER)
  })
  it('bounceReach equals v^2 / 2g and scales by kind', () => {
    expect(bounceReach()).toBeCloseTo((BOUNCE_VY * BOUNCE_VY) / (2 * GRAVITY))
    expect(bounceReach('super')).toBeGreaterThan(bounceReach('normal'))
    expect(bounceReach('rocket')).toBeGreaterThan(bounceReach('super'))
    expect(bounceReach('crumble')).toBeLessThan(bounceReach('normal'))
  })
  it('simulating a real bounce peaks above the worst-case gap', () => {
    let ball: Ball = { x: 0.5, y: 0, vx: 0, vy: BOUNCE_VY }
    let peak = ball.y
    for (let i = 0; i < 400 && ball.vy > 0; i += 1) {
      ball = stepBall(ball, 0, 16)
      if (ball.y > peak) peak = ball.y
    }
    expect(peak).toBeGreaterThan(MAX_SPACING + 2 * Y_JITTER)
  })
  it('every consecutive shelf gap is within the reach of the shelf below it', () => {
    for (const seed of [1, 42, 12345, 0xdeadbeef]) {
      for (let i = 0; i < 400; i += 1) {
        const kind = platformKindAt(seed, i)
        const gap = gapAbove(seed, i)
        expect(gap).toBeLessThan(bounceReach(kind))
        expect(gap).toBeGreaterThan(0) // jitter never reorders shelves
      }
    }
  })
})

describe('spacing ramp + jitter (variety with a difficulty trend)', () => {
  it('shelves get further apart as you climb, up to a cap', () => {
    expect(spacingBefore(1)).toBeCloseTo(BASE_SPACING)
    expect(spacingBefore(5)).toBeGreaterThan(spacingBefore(1))
    expect(spacingBefore(50)).toBeGreaterThan(spacingBefore(5))
    expect(spacingBefore(500)).toBeCloseTo(MAX_SPACING)
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
  it('jitter varies shelf heights but stays within ±Y_JITTER of the trend', () => {
    let jittered = 0
    for (let i = 1; i < 100; i += 1) {
      const off = platformYAt(7, i) - platformY(i)
      expect(Math.abs(off)).toBeLessThanOrEqual(Y_JITTER)
      if (Math.abs(off) > 0.05) jittered += 1
    }
    expect(jittered).toBeGreaterThan(50) // the ladder isn't secretly uniform
  })
})

describe('platformAt', () => {
  it('is deterministic, in-bounds, and follows the jittered platformYAt', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = platformAt(42, i)
      expect(platformAt(42, i)).toEqual(p)
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0)
      expect(p.x + p.width / 2).toBeLessThanOrEqual(1)
      expect(p.y).toBeCloseTo(platformYAt(42, i))
      expect(p.kind).toBe(platformKindAt(42, i))
    }
  })
  it('widths vary from shelf to shelf', () => {
    const widths = new Set<number>()
    for (let i = 0; i < 40; i += 1) widths.add(Math.round(platformAt(42, i).width * 1000))
    expect(widths.size).toBeGreaterThan(10)
  })
  it('the first shelves are always plain (a gentle start)', () => {
    for (const seed of [1, 2, 3, 99]) {
      for (let i = 0; i <= 3; i += 1) expect(platformKindAt(seed, i)).toBe('normal')
    }
  })
  it('special shelf kinds all appear eventually', () => {
    const kinds = new Set<string>()
    for (let i = 0; i < 2000; i += 1) kinds.add(platformKindAt(42, i))
    expect(kinds).toContain('normal')
    expect(kinds).toContain('super')
    expect(kinds).toContain('crumble')
    expect(kinds).toContain('fading')
  })
})

describe('nearestPlatformIndex', () => {
  it('round-trips the pre-jitter ladder', () => {
    for (const i of [0, 1, 2, 5, 13, 14, 30, 100]) {
      expect(nearestPlatformIndex(platformY(i))).toBe(i)
    }
  })
  it('lands within 1 of the true index for jittered shelf positions', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(Math.abs(nearestPlatformIndex(platformYAt(42, i)) - i)).toBeLessThanOrEqual(1)
    }
  })
  it('never returns a negative index', () => {
    expect(nearestPlatformIndex(-5)).toBe(0)
  })
})

describe('platformBroken (shelves vanish after their bounce budget)', () => {
  it('a plain shelf breaks once bounced MAX_BOUNCES times', () => {
    expect(MAX_BOUNCES).toBe(2)
    expect(platformBroken(0)).toBe(false)
    expect(platformBroken(1)).toBe(false)
    expect(platformBroken(2)).toBe(true)
    expect(platformBroken(3)).toBe(true)
  })
  it('crumble shelves break after a single bounce; springs last longer', () => {
    expect(platformBroken(1, 'crumble')).toBe(true)
    expect(platformBroken(2, 'super')).toBe(false)
    expect(platformBroken(3, 'super')).toBe(true)
  })
  it('fading shelves bounce at full strength and get a plain bounce budget — the dissolve clock (view-side, starting at first bounce) is what usually claims them', () => {
    expect(KIND_BOUNCE.fading).toBe(1)
    expect(platformBroken(1, 'fading')).toBe(false)
    expect(platformBroken(2, 'fading')).toBe(true)
  })
})

describe('bumpers (obstacles that never block the path)', () => {
  it('is deterministic and only present in larger gaps, off the landing lanes', () => {
    let found = 0
    for (let i = 0; i < 500; i += 1) {
      const b = bumperAt(42, i)
      expect(bumperAt(42, i)).toEqual(b)
      if (!b.present) continue
      found += 1
      expect(i).toBeGreaterThanOrEqual(8)
      expect(gapAbove(42, i)).toBeGreaterThanOrEqual(1.6)
      // Clear of both neighboring shelves' centers.
      expect(wrapDist(b.x, platformAt(42, i).x)).toBeGreaterThanOrEqual(0.3)
      expect(wrapDist(b.x, platformAt(42, i + 1).x)).toBeGreaterThanOrEqual(0.3)
      // Floating strictly between the two shelves.
      expect(b.y).toBeGreaterThan(platformAt(42, i).y)
      expect(b.y).toBeLessThan(platformAt(42, i + 1).y)
    }
    expect(found).toBeGreaterThan(0)
  })
  it('knocks the ball away horizontally and kills most of a climb', () => {
    const b = { present: true, x: 0.5, y: 10, r: 0.055 }
    const hit = bounceOffBumper({ x: 0.52, y: 10, vx: 0, vy: 5 }, b)
    expect(hit).not.toBeNull()
    expect(hit!.vx).toBeGreaterThan(0) // pushed away, to the right
    expect(hit!.vy).toBeLessThan(5) // climb mostly cancelled
    expect(wrapDist(hit!.x, b.x)).toBeGreaterThanOrEqual(b.r + BALL_RADIUS)
  })
  it('a top/bottom hit deflects without teleporting the ball sideways', () => {
    const b = { present: true, x: 0.5, y: 10, r: 0.055 }
    // Ball just above the bumper's crown: vertical overlap, no horizontal offset.
    const hit = bounceOffBumper({ x: 0.5, y: 10 + 0.05 / Y_TO_X, vx: 0, vy: 5 }, b)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(0.5) // no rim snap on a vertical hit
    expect(hit!.vy).toBeLessThan(5)
  })
  it('ignores a ball that is not touching (and absent bumpers)', () => {
    const b = { present: true, x: 0.5, y: 10, r: 0.055 }
    expect(bounceOffBumper({ x: 0.5, y: 12, vx: 0, vy: 0 }, b)).toBeNull()
    expect(
      bounceOffBumper({ x: 0.5, y: 10, vx: 0, vy: 0 }, { ...b, present: false }),
    ).toBeNull()
  })
})

describe('height tracking (Height score climbs with the ball)', () => {
  it('trackMaxHeight only ever rises as the ball ascends', () => {
    let max = 0
    for (const y of [0.5, 1.2, 1.0, 2.4, 2.0, 3.1]) max = trackMaxHeight(max, y)
    expect(max).toBe(3.1) // dips (1.0, 2.0) never lower the tracked peak
  })
  it('trackMaxHeight ignores a lower current y', () => {
    expect(trackMaxHeight(5, 3)).toBe(5)
    expect(trackMaxHeight(5, 9)).toBe(9)
  })
  it('heightScore grows with climbed height and is never negative', () => {
    expect(heightScore(0)).toBe(0)
    expect(heightScore(-0.02)).toBe(0) // tiny initial dip clamps to 0, not negative
    expect(heightScore(2.5)).toBe(25)
    expect(heightScore(10)).toBeGreaterThan(heightScore(5))
  })
  it('simulating a climb reports a rising, non-zero Height', () => {
    // Mirrors the view loop: step under gravity, track the peak, read the score.
    let ball: Ball = { x: 0.5, y: 0, vx: 0, vy: BOUNCE_VY }
    let max = 0
    for (let i = 0; i < 20; i += 1) {
      ball = stepBall(ball, 0, 16)
      max = trackMaxHeight(max, ball.y)
    }
    expect(max).toBeGreaterThan(0)
    expect(heightScore(max)).toBeGreaterThan(0)
  })
})

describe('BALL_RADIUS sanity', () => {
  it('is small enough to fit between shelves', () => {
    expect(BALL_RADIUS * 2).toBeLessThan(BASE_SPACING - Y_JITTER * 2)
  })
})
