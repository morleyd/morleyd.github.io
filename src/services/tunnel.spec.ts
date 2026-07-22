import { describe, it, expect } from 'vitest'
import {
  FLAP_VX,
  FLAP_VY,
  FLYER_RADIUS,
  GRAVITY,
  VIEW_ANCHOR,
  cameraBottomFor,
  collides,
  difficultyFor,
  flap,
  flapUp,
  hasFallenOff,
  segmentAt,
  stepFlyer,
  type FlyerState,
} from './tunnel'

const at = (over: Partial<FlyerState> = {}): FlyerState => ({ x: 0.5, vx: 0, y: 0, vy: 0, ...over })

describe('flap (horizontal nudge)', () => {
  it('sets velocity toward the tapped side', () => {
    expect(flap(at(), 1).vx).toBe(FLAP_VX)
    expect(flap(at(), -1).vx).toBe(-FLAP_VX)
  })
  it('leaves vertical motion untouched', () => {
    const s = flap(at({ y: 3, vy: 2 }), 1)
    expect(s.y).toBe(3)
    expect(s.vy).toBe(2)
  })
})

describe('flapUp', () => {
  it('sets an upward vertical impulse', () => {
    expect(flapUp(at()).vy).toBe(FLAP_VY)
    expect(FLAP_VY).toBeGreaterThan(0)
  })
  it('a flap raises the ball on the next steps', () => {
    let s = flapUp(at())
    const y0 = s.y
    for (let i = 0; i < 5; i += 1) s = stepFlyer(s, 16)
    expect(s.y).toBeGreaterThan(y0)
  })
})

describe('stepFlyer — vertical physics', () => {
  it('gravity lowers a ball that is not flapping', () => {
    const next = stepFlyer(at({ y: 5, vy: 0 }), 16)
    expect(next.y).toBeLessThan(5)
    expect(next.vy).toBeLessThan(0)
  })
  it('gravity pulls velocity down by GRAVITY·dt', () => {
    const next = stepFlyer(at({ vy: 0 }), 100)
    expect(next.vy).toBeCloseTo(-GRAVITY * 0.1)
  })
  it('a flap then coasting arcs up and comes back down (Flappy rhythm)', () => {
    let s = flapUp(at())
    let peak = s.y
    for (let i = 0; i < 120; i += 1) {
      s = stepFlyer(s, 16)
      peak = Math.max(peak, s.y)
    }
    expect(peak).toBeGreaterThan(0) // it rose
    expect(s.y).toBeLessThan(peak) // then fell back below the peak
  })
})

describe('stepFlyer — horizontal physics', () => {
  it('moves in the direction of velocity and decays it', () => {
    const next = stepFlyer(at({ vx: 0.5 }), 16)
    expect(next.x).toBeGreaterThan(0.5)
    expect(Math.abs(next.vx)).toBeLessThan(0.5)
  })
  it('clamps to the left edge and kills momentum', () => {
    const next = stepFlyer(at({ x: FLYER_RADIUS + 0.001, vx: -1 }), 100)
    expect(next.x).toBe(FLYER_RADIUS)
    expect(next.vx).toBe(0)
  })
  it('clamps to the right edge', () => {
    const next = stepFlyer(at({ x: 1 - FLYER_RADIUS - 0.001, vx: 1 }), 100)
    expect(next.x).toBe(1 - FLYER_RADIUS)
    expect(next.vx).toBe(0)
  })
  it('settles toward rest as time passes (drift decays)', () => {
    let s = at({ vx: 0.4 })
    for (let i = 0; i < 150; i += 1) s = stepFlyer(s, 16)
    expect(Math.abs(s.vx)).toBeLessThan(0.01)
  })
  it('a single flap nudges rather than lurches across the tunnel', () => {
    // One flap, then coast to rest. The total travel must be a small nudge
    // (well under the width of a typical gap), not a lurch across it.
    let s = flap(at(), 1)
    for (let i = 0; i < 120; i += 1) s = stepFlyer(s, 16) // ~1.9s of coasting
    const travel = s.x - 0.5
    expect(travel).toBeGreaterThan(0.08)
    expect(travel).toBeLessThan(0.16)
  })
})

describe('camera + fall-death', () => {
  const viewRows = 10
  it('rises to anchor the ball as it climbs', () => {
    const bottom = cameraBottomFor(Number.NEGATIVE_INFINITY, 5, viewRows)
    expect(bottom).toBe(5 - VIEW_ANCHOR * viewRows)
  })
  it('never scrolls back down when the ball sinks', () => {
    const peak = cameraBottomFor(Number.NEGATIVE_INFINITY, 20, viewRows)
    const afterSink = cameraBottomFor(peak, 12, viewRows)
    expect(afterSink).toBe(peak)
  })
  it('a climbing ball stays above the bottom edge', () => {
    const bottom = cameraBottomFor(Number.NEGATIVE_INFINITY, 8, viewRows)
    expect(hasFallenOff(8, bottom)).toBe(false)
  })
  it('ends the game once the ball sinks past the frozen bottom edge', () => {
    const bottom = cameraBottomFor(Number.NEGATIVE_INFINITY, 20, viewRows)
    // Ball dives well below where the camera froze.
    expect(hasFallenOff(20 - VIEW_ANCHOR * viewRows - 0.01, bottom)).toBe(true)
  })
  it('height increments across a rising run and drives the fall threshold', () => {
    let s = at()
    let camBottom = cameraBottomFor(Number.NEGATIVE_INFINITY, s.y, viewRows)
    let peakHeight = s.y
    // Flap in a steady, brisk rhythm — every ~9 frames (~7 Hz-ish) — and climb.
    for (let i = 0; i < 90; i += 1) {
      if (i % 9 === 0) s = flapUp(s)
      s = stepFlyer(s, 16)
      camBottom = cameraBottomFor(camBottom, s.y, viewRows)
      peakHeight = Math.max(peakHeight, s.y)
      expect(hasFallenOff(s.y, camBottom)).toBe(false)
    }
    expect(peakHeight).toBeGreaterThan(1) // the score would have incremented
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
    // Sweep several seeds and go well past the difficulty cap so the hardest,
    // most-narrowed, most-pinched sections are exercised too.
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
    expect(difficultyFor(200)).toBeCloseTo(0.5)
    expect(difficultyFor(10000)).toBe(1)
  })
  it('never goes negative', () => {
    expect(difficultyFor(-50)).toBe(0)
  })
})
