import { describe, it, expect } from 'vitest'
import {
  FLAP_VX,
  FLYER_RADIUS,
  collides,
  difficultyFor,
  flap,
  segmentAt,
  stepFlyer,
  type FlyerState,
} from './tunnel'

describe('flap', () => {
  it('sets velocity toward the tapped side', () => {
    expect(flap({ x: 0.5, vx: 0 }, 1).vx).toBe(FLAP_VX)
    expect(flap({ x: 0.5, vx: 0 }, -1).vx).toBe(-FLAP_VX)
  })
})

describe('stepFlyer', () => {
  it('moves in the direction of velocity and decays it', () => {
    const next = stepFlyer({ x: 0.5, vx: 0.5 }, 16)
    expect(next.x).toBeGreaterThan(0.5)
    expect(Math.abs(next.vx)).toBeLessThan(0.5)
  })
  it('clamps to the left edge and kills momentum', () => {
    const next = stepFlyer({ x: FLYER_RADIUS + 0.001, vx: -1 }, 100)
    expect(next.x).toBe(FLYER_RADIUS)
    expect(next.vx).toBe(0)
  })
  it('clamps to the right edge', () => {
    const next = stepFlyer({ x: 1 - FLYER_RADIUS - 0.001, vx: 1 }, 100)
    expect(next.x).toBe(1 - FLYER_RADIUS)
    expect(next.vx).toBe(0)
  })
  it('settles toward rest as time passes (drift decays)', () => {
    let s: FlyerState = { x: 0.5, vx: 0.4 }
    for (let i = 0; i < 150; i += 1) s = stepFlyer(s, 16)
    expect(Math.abs(s.vx)).toBeLessThan(0.01)
  })
})

describe('collides', () => {
  const seg = { left: 0.3, right: 0.7 }
  it('is false when the flyer fits in the gap', () => {
    expect(collides(0.5, seg)).toBe(false)
  })
  it('is true when overlapping a wall', () => {
    expect(collides(0.3 + FLYER_RADIUS - 0.001, seg)).toBe(true) // into left wall
    expect(collides(0.7 - FLYER_RADIUS + 0.001, seg)).toBe(true) // into right wall
  })
})

describe('segmentAt', () => {
  it('is deterministic for a seed + row', () => {
    expect(segmentAt(123, 5)).toEqual(segmentAt(123, 5))
  })
  it('always leaves a passable, in-bounds gap', () => {
    for (let row = 0; row < 300; row += 1) {
      const seg = segmentAt(999, row, difficultyFor(row))
      expect(seg.left).toBeGreaterThanOrEqual(0.02)
      expect(seg.right).toBeLessThanOrEqual(0.98)
      // The gap must fit the flyer plus a little slack.
      expect(seg.right - seg.left).toBeGreaterThan(2 * FLYER_RADIUS)
    }
  })
})

describe('difficultyFor', () => {
  it('rises with distance and caps at 1', () => {
    expect(difficultyFor(0)).toBe(0)
    expect(difficultyFor(300)).toBeCloseTo(0.5)
    expect(difficultyFor(10000)).toBe(1)
  })
})
