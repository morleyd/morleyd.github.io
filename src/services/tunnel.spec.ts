import { describe, it, expect } from 'vitest'
import {
  BASE_SCROLL_SPEED,
  FLAP_VX,
  FLYER_RADIUS,
  collides,
  difficultyFor,
  flap,
  scrollSpeedFor,
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
  it('always leaves a passable, in-bounds gap across the whole difficulty range', () => {
    // Sweep several seeds and go well past the difficulty cap (600 rows) so the
    // hardest, most-narrowed, most-pinched sections are exercised too.
    for (const seed of [1, 42, 999, 0xabcdef]) {
      for (let row = 0; row < 1200; row += 1) {
        const seg = segmentAt(seed, row, difficultyFor(row))
        expect(seg.left).toBeGreaterThanOrEqual(0.02)
        expect(seg.right).toBeLessThanOrEqual(0.98)
        // The gap must fit the circle plus a little slack.
        expect(seg.right - seg.left).toBeGreaterThan(2 * FLYER_RADIUS)
      }
    }
  })
  it('breathes — produces both roomy and pinched gaps rather than a constant width', () => {
    let min = Infinity
    let max = -Infinity
    for (let row = 0; row < 400; row += 1) {
      const gap = (({ left, right }) => right - left)(segmentAt(7, row, difficultyFor(row)))
      min = Math.min(min, gap)
      max = Math.max(max, gap)
    }
    // Wide stretches are meaningfully wider than the tightest pinches.
    expect(max - min).toBeGreaterThan(0.1)
  })
  it('narrows on average as difficulty rises', () => {
    const avgGap = (difficulty: number) => {
      let sum = 0
      for (let row = 0; row < 200; row += 1) {
        const seg = segmentAt(55, row, difficulty)
        sum += seg.right - seg.left
      }
      return sum / 200
    }
    expect(avgGap(1)).toBeLessThan(avgGap(0))
  })
})

describe('difficultyFor', () => {
  it('rises with distance and caps at 1', () => {
    expect(difficultyFor(0)).toBe(0)
    expect(difficultyFor(300)).toBeCloseTo(0.5)
    expect(difficultyFor(10000)).toBe(1)
  })
  it('never goes negative', () => {
    expect(difficultyFor(-50)).toBe(0)
  })
})

describe('scrollSpeedFor', () => {
  it('starts at the base speed', () => {
    expect(scrollSpeedFor(0)).toBeCloseTo(BASE_SCROLL_SPEED)
  })
  it('keeps accelerating with distance (strictly increasing, no cap)', () => {
    let prev = scrollSpeedFor(0)
    for (const d of [50, 200, 600, 1200, 5000, 20000]) {
      const next = scrollSpeedFor(d)
      expect(next).toBeGreaterThan(prev)
      prev = next
    }
  })
  it('is meaningfully faster deep into a run than at the start', () => {
    expect(scrollSpeedFor(2000)).toBeGreaterThan(scrollSpeedFor(0) * 1.5)
  })
})
