import { describe, it, expect } from 'vitest'
import {
  LAVA_MAX_SPEED,
  MAX_CHARGE_MS,
  MAX_JUMP_HEIGHT,
  MAX_JUMP_VY,
  MIN_JUMP_VY,
  WALL_X,
  chargeToVy,
  hitsSpike,
  initialNinja,
  jump,
  lavaSpeed,
  predictTrajectory,
  spikeAt,
  stepLava,
  stepNinja,
  type NinjaState,
} from './wallJump'

describe('chargeToVy', () => {
  it('maps hold duration to jump speed, clamped', () => {
    expect(chargeToVy(0)).toBe(MIN_JUMP_VY)
    expect(chargeToVy(MAX_CHARGE_MS)).toBe(MAX_JUMP_VY)
    expect(chargeToVy(9999)).toBe(MAX_JUMP_VY)
    expect(chargeToVy(MAX_CHARGE_MS / 2)).toBeCloseTo((MIN_JUMP_VY + MAX_JUMP_VY) / 2)
  })
})

describe('jump power scaling and bounds', () => {
  const apex = (holdMs: number): number => {
    let s = jump(initialNinja(), holdMs)
    let peak = s.y
    for (let i = 0; i < 200 && s.airborne; i += 1) {
      s = stepNinja(s, 16)
      peak = Math.max(peak, s.y)
    }
    return peak
  }

  it('gives a big difference between a tap and a full hold', () => {
    // A short tap barely rises; a full hold arcs well over a climb unit higher.
    expect(apex(MAX_CHARGE_MS) - apex(0)).toBeGreaterThan(1)
  })

  it('caps the apex at MAX_JUMP_HEIGHT even for an absurd hold', () => {
    const eps = 0.05
    expect(apex(MAX_CHARGE_MS)).toBeLessThanOrEqual(MAX_JUMP_HEIGHT + eps)
    expect(apex(999999)).toBeLessThanOrEqual(MAX_JUMP_HEIGHT + eps)
  })
})

describe('predictTrajectory', () => {
  it('is empty when already airborne', () => {
    expect(predictTrajectory({ ...initialNinja(), airborne: true }, 300)).toEqual([])
  })

  it('grows the arc with a longer hold', () => {
    const peak = (holdMs: number) => Math.max(...predictTrajectory(initialNinja(), holdMs).map((p) => p.y))
    expect(peak(MAX_CHARGE_MS)).toBeGreaterThan(peak(0))
  })

  it('never leaves the playfield: x within the walls, apex clamped', () => {
    // Even a huge charge must stay between the walls and under the height cap.
    const path = predictTrajectory(initialNinja(), 999999)
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(WALL_X['-1'] - 1e-9)
      expect(p.x).toBeLessThanOrEqual(WALL_X['1'] + 1e-9)
      expect(p.y).toBeLessThanOrEqual(MAX_JUMP_HEIGHT + 0.05)
    }
    // Ends clinging to the opposite (right) wall.
    expect(path[path.length - 1].x).toBeCloseTo(WALL_X['1'])
  })
})

describe('lava', () => {
  it('accelerates: rises faster over time, clamped to a ceiling', () => {
    expect(lavaSpeed(5000)).toBeGreaterThan(lavaSpeed(0))
    expect(lavaSpeed(1_000_000)).toBeCloseTo(LAVA_MAX_SPEED)
  })

  it('stepLava climbs more in a later frame than an early one', () => {
    const early = stepLava(0, 0, 100) // first 100ms
    const late = stepLava(0, 8000, 100) // 100ms, 8s into the run
    expect(late).toBeGreaterThan(early)
  })
})

describe('jump', () => {
  it('launches toward the opposite wall and goes airborne', () => {
    const j = jump(initialNinja(), MAX_CHARGE_MS) // on left wall
    expect(j.airborne).toBe(true)
    expect(j.vx).toBeGreaterThan(0) // moving right, away from the left wall
    expect(j.vy).toBe(MAX_JUMP_VY)
  })
  it('is a no-op while already airborne', () => {
    const air: NinjaState = { ...initialNinja(), airborne: true }
    expect(jump(air, 200)).toBe(air)
  })
})

describe('stepNinja', () => {
  it('does nothing while grounded', () => {
    const g = initialNinja()
    expect(stepNinja(g, 16)).toBe(g)
  })
  it('applies gravity to vertical velocity while airborne', () => {
    const air = jump(initialNinja(), MAX_CHARGE_MS)
    const next = stepNinja(air, 16)
    expect(next.vy).toBeLessThan(air.vy)
  })
  it('clings to the opposite wall on arrival, flipping side and grounding', () => {
    let s = jump(initialNinja(), MAX_CHARGE_MS) // from left → flying right
    for (let i = 0; i < 200 && s.airborne; i += 1) s = stepNinja(s, 16)
    expect(s.airborne).toBe(false)
    expect(s.side).toBe(1)
    expect(s.x).toBeCloseTo(WALL_X['1'])
  })
})

describe('spikeAt', () => {
  it('is deterministic and picks a single wall', () => {
    const a = spikeAt(77, 3)
    expect(spikeAt(77, 3)).toEqual(a)
    expect([-1, 1]).toContain(a.side)
    expect(a.y).toBeGreaterThan(0)
  })
})

describe('hitsSpike', () => {
  it('impales a ninja clinging at a spike on the same wall', () => {
    const seed = 5
    const spike = spikeAt(seed, 4)
    const s: NinjaState = { side: spike.side, x: WALL_X[spike.side], y: spike.y, vx: 0, vy: 0, airborne: false }
    expect(hitsSpike(s, seed)).toBe(true)
  })
  it('is safe on the opposite wall from the spike', () => {
    const seed = 5
    const spike = spikeAt(seed, 4)
    const other = (spike.side * -1) as -1 | 1
    const s: NinjaState = { side: other, x: WALL_X[other], y: spike.y, vx: 0, vy: 0, airborne: false }
    expect(hitsSpike(s, seed)).toBe(false)
  })
  it('is safe airborne out in the middle of the shaft', () => {
    const seed = 5
    const spike = spikeAt(seed, 4)
    const s: NinjaState = { side: spike.side, x: 0.5, y: spike.y, vx: 0.9, vy: 0, airborne: true }
    expect(hitsSpike(s, seed)).toBe(false)
  })
  it('kills the ninja that flies into a spike near its wall', () => {
    const seed = 5
    const spike = spikeAt(seed, 4)
    // Airborne but pressed up against the spike's wall within its reach.
    const s: NinjaState = { side: spike.side, x: WALL_X[spike.side], y: spike.y, vx: 0.9, vy: 0, airborne: true }
    expect(hitsSpike(s, seed)).toBe(true)
  })
  it('is safe at the start (no spike near y=0)', () => {
    expect(hitsSpike(initialNinja(), 5)).toBe(false)
  })
})
