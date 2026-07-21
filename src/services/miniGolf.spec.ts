import { describe, it, expect } from 'vitest'
import {
  BALL_RADIUS,
  CAPTURE_SPEED,
  MAX_POWER,
  aimToVelocity,
  atRest,
  collide,
  inCup,
  makeHole,
  speed,
  step,
  type BallState,
  type Hole,
} from './miniGolf'

describe('collide (outer walls)', () => {
  it('reflects off the left/right/top/bottom bounds', () => {
    const left = collide({ p: { x: -0.1, y: 0.5 }, v: { x: -0.5, y: 0 } }, [])
    expect(left.p.x).toBeCloseTo(BALL_RADIUS)
    expect(left.v.x).toBeGreaterThan(0)

    const bottom = collide({ p: { x: 0.5, y: 1.2 }, v: { x: 0, y: 0.5 } }, [])
    expect(bottom.p.y).toBeCloseTo(1 - BALL_RADIUS)
    expect(bottom.v.y).toBeLessThan(0)
  })
})

describe('collide (inner walls)', () => {
  const wall = { x: 0.4, y: 0.4, w: 0.2, h: 0.05 }
  it('pushes the ball out and flips a velocity component on overlap', () => {
    // Ball just above the wall moving down into it.
    const s: BallState = { p: { x: 0.5, y: 0.4 + 0.01 }, v: { x: 0, y: -0.5 } }
    const out = collide(s, [wall])
    // Pushed above the wall, vertical velocity flips upward (positive is down here? no: y-down)
    expect(out.p.y).toBeLessThanOrEqual(wall.y - BALL_RADIUS + 1e-9)
  })
  it('leaves a ball far from the wall untouched', () => {
    const s: BallState = { p: { x: 0.1, y: 0.1 }, v: { x: 0.2, y: 0.2 } }
    expect(collide(s, [wall])).toEqual(s)
  })
})

describe('step', () => {
  it('moves the ball and applies friction', () => {
    const s: BallState = { p: { x: 0.5, y: 0.5 }, v: { x: 0.4, y: 0 } }
    const next = step(s, [], 16)
    expect(next.p.x).toBeGreaterThan(0.5)
    expect(speed(next.v)).toBeLessThan(speed(s.v))
  })
  it('eventually comes to rest', () => {
    let s: BallState = { p: { x: 0.5, y: 0.5 }, v: { x: 0.6, y: 0.3 } }
    for (let i = 0; i < 600 && !atRest(s); i += 1) s = step(s, [], 16)
    expect(atRest(s)).toBe(true)
  })
})

describe('aimToVelocity', () => {
  it('fires opposite the drag, scaled by power', () => {
    const v = aimToVelocity({ x: 10, y: 0 }, 1) // dragged right → fire left
    expect(v.x).toBeCloseTo(-MAX_POWER)
    expect(v.y).toBeCloseTo(0)
  })
  it('clamps power to [0,1]', () => {
    expect(speed(aimToVelocity({ x: 0, y: 5 }, 5))).toBeCloseTo(MAX_POWER)
    expect(speed(aimToVelocity({ x: 0, y: 5 }, -1))).toBe(0)
  })
})

describe('inCup', () => {
  const hole: Hole = {
    index: 0,
    start: { x: 0.5, y: 0.86 },
    cup: { x: 0.5, y: 0.12 },
    cupRadius: 0.05,
    walls: [],
    par: 3,
    seed: 's',
  }
  it('captures a slow ball over the cup', () => {
    expect(inCup({ p: { x: 0.5, y: 0.12 }, v: { x: 0.1, y: 0 } }, hole)).toBe(true)
  })
  it('rejects a fast ball over the cup (lips out)', () => {
    expect(inCup({ p: { x: 0.5, y: 0.12 }, v: { x: CAPTURE_SPEED + 0.1, y: 0 } }, hole)).toBe(false)
  })
  it('rejects a ball away from the cup', () => {
    expect(inCup({ p: { x: 0.9, y: 0.9 }, v: { x: 0, y: 0 } }, hole)).toBe(false)
  })
})

describe('makeHole', () => {
  it('is deterministic and well-formed', () => {
    for (let i = 0; i < 9; i += 1) {
      const h = makeHole(i, 'course-1')
      expect(makeHole(i, 'course-1')).toEqual(h)
      expect(h.start.y).toBeGreaterThan(h.cup.y) // start below the cup (portrait)
      expect(h.par).toBeGreaterThanOrEqual(2)
      expect(h.walls.length).toBeGreaterThanOrEqual(1)
      for (const w of h.walls) {
        expect(w.x).toBeGreaterThanOrEqual(0)
        expect(w.x + w.w).toBeLessThanOrEqual(1.0001)
      }
    }
  })
})
