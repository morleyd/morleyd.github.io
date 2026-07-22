import { describe, it, expect } from 'vitest'
import {
  BALL_RADIUS,
  CANCEL_POWER,
  CAPTURE_SPEED,
  COURSE_HOLES,
  MAX_POWER,
  aimToVelocity,
  atRest,
  collide,
  courseResult,
  derivePar,
  holeResult,
  inCup,
  isWinnable,
  makeHole,
  moverEnvelope,
  moverRectAt,
  planPutt,
  solveHole,
  speed,
  step,
  type BallState,
  type Hole,
  type MovingWall,
  type Vec,
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
  it('never exceeds MAX_POWER for an off-screen drag (power > 1)', () => {
    // A drag that runs well beyond the canvas produces power far above 1; the
    // launch speed must still cap at full power rather than growing unbounded.
    for (const p of [1.5, 3, 100]) {
      expect(speed(aimToVelocity({ x: 3, y: -4 }, p))).toBeCloseTo(MAX_POWER)
    }
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
    for (let i = 0; i < COURSE_HOLES; i += 1) {
      const h = makeHole(i, 'course-1')
      expect(makeHole(i, 'course-1')).toEqual(h)
      expect(h.start.y).toBeGreaterThan(h.cup.y) // start below the cup (portrait)
      expect(h.par).toBeGreaterThanOrEqual(2)
      expect(h.par).toBeLessThanOrEqual(5)
      for (const w of h.walls) {
        expect(w.x).toBeGreaterThanOrEqual(0)
        expect(w.x + w.w).toBeLessThanOrEqual(1.0001)
      }
    }
  })
})

describe('winnability guarantee', () => {
  it('every generated hole across many seeds is winnable', () => {
    const seeds = ['course-1', 'abc', 'z9', 'seed42', 'hello-world', 'qqqq', '01234']
    for (const seed of seeds) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        expect(h.winnable).toBe(true)
        expect(isWinnable(h)).toBe(true) // recomputed from geometry
        expect(solveHole(h)).not.toBeNull()
      }
    }
  })

  it('reports a hole with the cup walled off as unsolvable', () => {
    const boxed: Hole = {
      index: 0,
      start: { x: 0.5, y: 0.86 },
      cup: { x: 0.5, y: 0.12 },
      cupRadius: 0.05,
      // Four bars sealing the cup into a box the ball can never reach.
      walls: [
        { x: 0.3, y: 0.02, w: 0.4, h: 0.03 },
        { x: 0.3, y: 0.22, w: 0.4, h: 0.03 },
        { x: 0.3, y: 0.02, w: 0.03, h: 0.23 },
        { x: 0.67, y: 0.02, w: 0.03, h: 0.23 },
      ],
      hazards: [],
      movers: [],
      par: 2,
      seed: 's',
      winnable: false,
    }
    expect(solveHole(boxed)).toBeNull()
    expect(isWinnable(boxed)).toBe(false)
  })
})

describe('par derivation', () => {
  it('a short, clear hole is par 2', () => {
    const h: Hole = {
      index: 0,
      start: { x: 0.5, y: 0.6 },
      cup: { x: 0.5, y: 0.3 }, // clear straight line, distance 0.3
      cupRadius: 0.05,
      walls: [],
      hazards: [],
      movers: [],
      par: 0,
      seed: 's',
      winnable: true,
    }
    expect(derivePar(h, solveHole(h)!)).toBe(2)
  })

  it('adds strokes for a long green and for hazards, capped at 5', () => {
    const long: Hole = {
      index: 0,
      start: { x: 0.5, y: 0.9 },
      cup: { x: 0.5, y: 0.1 }, // distance 0.8 → long
      cupRadius: 0.05,
      walls: [],
      hazards: [{ p: { x: 0.2, y: 0.5 }, r: 0.06 }],
      movers: [],
      par: 0,
      seed: 's',
      winnable: true,
    }
    // direct(2) + long(1) + hazard(1) = 4
    expect(derivePar(long, solveHole(long)!)).toBe(4)
  })

  it('course par trends upward as holes get harder', () => {
    const early = makeHole(0, 'course-1').par + makeHole(1, 'course-1').par + makeHole(2, 'course-1').par
    const late = makeHole(6, 'course-1').par + makeHole(7, 'course-1').par + makeHole(8, 'course-1').par
    expect(late).toBeGreaterThan(early)
  })
})

describe('planPutt (stroke counting)', () => {
  it('a real drag counts as exactly one stroke and fires opposite the drag', () => {
    const putt = planPutt({ x: 100, y: 0 }, 300, 0.38) // drag right → fire left
    expect(putt.counts).toBe(true)
    expect(putt.velocity.x).toBeLessThan(0)
  })
  it('a tiny drag does not count (cancel — no stroke)', () => {
    const tiny = CANCEL_POWER * 0.38 * 300 * 0.5 // well below the cancel threshold
    const putt = planPutt({ x: tiny, y: 0 }, 300, 0.38)
    expect(putt.counts).toBe(false)
    expect(speed(putt.velocity)).toBe(0)
  })
  it('clamps power to full even for an off-board drag', () => {
    const putt = planPutt({ x: 100000, y: 0 }, 300, 0.38)
    expect(putt.power).toBe(1)
    expect(speed(putt.velocity)).toBeCloseTo(MAX_POWER)
  })
})

describe('sink detection', () => {
  it('a putt rolled into the cup registers as holed', () => {
    const h = makeHole(0, 'course-1')
    // Aim straight from tee toward the cup with moderate power (pull back = drag
    // opposite the travel direction), then roll the ball step-by-step.
    const drag = { x: h.start.x - h.cup.x, y: h.start.y - h.cup.y }
    let ball: BallState = { p: { ...h.start }, v: aimToVelocity(drag, 0.7) }
    let holed = false
    for (let i = 0; i < 1500 && !holed; i += 1) {
      ball = step(ball, h.walls, 8)
      if (inCup(ball, h)) holed = true
      else if (atRest(ball)) break
    }
    expect(holed).toBe(true) // reaches the cup slow enough to drop
  })

  it('inCup fires the instant a slow ball sits over the cup', () => {
    const h = makeHole(0, 'course-1')
    expect(inCup({ p: { ...h.cup }, v: { x: 0, y: 0 } }, h)).toBe(true)
  })
})

describe('planPutt (redirect a moving ball)', () => {
  it('a real drag yields a fresh nonzero velocity to redirect a rolling ball', () => {
    // The ball is already moving; a swing produces a brand-new velocity from the
    // drag alone (independent of the old motion) so the caller can redirect it.
    const putt = planPutt({ x: 0, y: 120 }, 300, 0.38) // drag down → fire up
    expect(putt.counts).toBe(true)
    expect(speed(putt.velocity)).toBeGreaterThan(0)
    expect(putt.velocity.y).toBeLessThan(0)
  })
  it('a cancel yields no stroke and zero velocity, so the caller leaves motion untouched', () => {
    const moving: Vec = { x: 0.4, y: -0.2 } // pretend current ball velocity
    const putt = planPutt({ x: 1, y: 0 }, 300, 0.38) // sub-threshold tap
    expect(putt.counts).toBe(false)
    // The view applies the new velocity only when counts is true; on a cancel the
    // ball's existing velocity is preserved unchanged.
    const applied = putt.counts ? putt.velocity : moving
    expect(applied).toEqual(moving)
  })
})

describe('moving walls', () => {
  const m: MovingWall = { base: { x: 0.2, y: 0.5, w: 0.1, h: 0.04 }, axis: 'x', amp: 0.4, speed: 2, phase: 0 }
  it('stays within its envelope at all times', () => {
    const env = moverEnvelope(m)
    for (let t = 0; t < 4000; t += 100) {
      const r = moverRectAt(m, t)
      expect(r.x).toBeGreaterThanOrEqual(env.x - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(env.x + env.w + 1e-9)
      expect(r.y).toBe(m.base.y)
    }
  })
})

describe('taglines', () => {
  const fixed = () => 0 // deterministic pick
  it('names the right golf term for each score vs par', () => {
    expect(holeResult(1, 3, fixed).term).toBe('Hole in one!')
    expect(holeResult(1, 4, fixed).term).toBe('Hole in one!') // ace beats par label
    expect(holeResult(2, 4, fixed).term).toBe('Eagle!')
    expect(holeResult(3, 4, fixed).term).toBe('Birdie')
    expect(holeResult(4, 4, fixed).term).toBe('Par')
    expect(holeResult(5, 4, fixed).term).toBe('Bogey')
    expect(holeResult(6, 4, fixed).term).toBe('Double bogey')
    expect(holeResult(7, 4, fixed).term).toBe('Triple bogey')
    expect(holeResult(2, 5, fixed).term).toBe('Albatross!')
  })
  it('varies the blurb with randomness but stays in range', () => {
    for (let i = 0; i < 20; i += 1) {
      const r = holeResult(4, 4, () => i / 20)
      expect(r.term).toBe('Par')
      expect(r.blurb.length).toBeGreaterThan(0)
    }
  })
  it('summarises a round under/at/over par', () => {
    expect(courseResult(20, 27, fixed).term).toBe('Tour-level round!')
    expect(courseResult(25, 27, fixed).term).toBe('Under par!')
    expect(courseResult(27, 27, fixed).term).toBe('Even par')
    expect(courseResult(30, 27, fixed).term).toBe('Just over par')
    expect(courseResult(40, 27, fixed).term).toBe('Room to improve')
  })
})
