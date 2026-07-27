import { describe, it, expect } from 'vitest'
import {
  BALL_RADIUS,
  CANCEL_POWER,
  CAPTURE_SPEED,
  COURSE_HOLES,
  FRICTION,
  MAX_POWER,
  PULL_REACH,
  RAMP_MIN_SPEED,
  aimToVelocity,
  airborne,
  atRest,
  collide,
  courseResult,
  derivePar,
  effectiveWalls,
  holeResult,
  inCup,
  inSand,
  inVoid,
  inWater,
  isWinnable,
  makeHole,
  moverEnvelope,
  moverRectAt,
  planPutt,
  routeTarget,
  routeWaypoints,
  solveHole,
  speed,
  step,
  type BallState,
  type Hole,
  type Vec,
} from './miniGolf'

const SEEDS = ['course-1', 'abc', 'z9', 'seed42', 'hello-world']

/** A bare hole for physics tests: no obstacles unless the test adds them. */
const bareHole = (over: Partial<Hole> = {}): Hole => ({
  index: 0,
  start: { x: 0.5, y: 0.9 },
  cup: { x: 0.5, y: 0.15 },
  cupRadius: 0.05,
  walls: [],
  hazards: [],
  movers: [],
  voids: [],
  ramps: [],
  cuts: [],
  par: 2,
  seed: 's',
  winnable: true,
  ...over,
})

describe('collide', () => {
  it('reflects off the outer bounds', () => {
    const s: BallState = { p: { x: 0.005, y: 0.5 }, v: { x: -0.4, y: 0 } }
    const out = collide(s, [])
    expect(out.p.x).toBeCloseTo(BALL_RADIUS)
    expect(out.v.x).toBeGreaterThan(0)
  })
  it('reflects off an inner wall along the shallow axis', () => {
    const wall = { x: 0.4, y: 0.4, w: 0.2, h: 0.04 }
    const s: BallState = { p: { x: 0.5, y: 0.4 + 0.01 }, v: { x: 0, y: 0.5 } }
    const out = collide(s, [wall])
    expect(out.v.y).toBeLessThan(0) // bounced back up
  })
})

describe('step / friction', () => {
  it('slows the ball exponentially and it eventually rests', () => {
    let s: BallState = { p: { x: 0.5, y: 0.5 }, v: { x: 0.6, y: 0.3 } }
    for (let i = 0; i < 600 && !atRest(s); i += 1) s = step(s, [], 16)
    expect(atRest(s)).toBe(true)
  })
  it('leaves physics untouched away from the cup, sand and ramps', () => {
    const hole = bareHole()
    const far: BallState = { p: { x: 0.2, y: 0.9 }, v: { x: 0.4, y: 0 } }
    expect(step(far, [], 8, hole)).toEqual(step(far, [], 8))
  })
})

describe('cup capture (the black circle is the real capture zone)', () => {
  const hole = bareHole({ cup: { x: 0.5, y: 0.5 } })
  it('captures a slow ball whose center is over the black', () => {
    expect(inCup({ p: { x: 0.5, y: 0.5 }, v: { x: 0.1, y: 0 } }, hole)).toBe(true)
    expect(
      inCup({ p: { x: 0.5 + hole.cupRadius * 0.9, y: 0.5 }, v: { x: 0.1, y: 0 } }, hole),
    ).toBe(true)
  })
  it('a fast ball dead over the hole drops (nothing under it) — a hot graze lips out', () => {
    // Dead center: any speed falls in.
    expect(inCup({ p: { x: 0.5, y: 0.5 }, v: { x: MAX_POWER, y: 0 } }, hole)).toBe(true)
    // Grazing the black's edge while hot: stays out.
    const graze = { x: 0.5 + hole.cupRadius * 0.8, y: 0.5 }
    expect(inCup({ p: graze, v: { x: CAPTURE_SPEED + 0.1, y: 0 } }, hole)).toBe(false)
    // The same graze, slow: drops.
    expect(inCup({ p: graze, v: { x: 0.2, y: 0 } }, hole)).toBe(true)
  })
  it('rejects a ball just OUTSIDE the black — no long-range suction', () => {
    const p = { x: 0.5 + hole.cupRadius * 1.05, y: 0.5 }
    expect(inCup({ p, v: { x: 0, y: 0 } }, hole)).toBe(false)
  })
  it('a resting ball near — but not touching — the cup stays put', () => {
    // Regression for "the ball gets sucked in from too far away": outside the
    // pull reach nothing moves the ball.
    const start: BallState = { p: { x: 0.5 + hole.cupRadius * PULL_REACH * 1.4, y: 0.5 }, v: { x: 0, y: 0 } }
    const after = step(start, [], 8, hole)
    expect(after.v.x).toBeCloseTo(0)
    expect(after.v.y).toBeCloseTo(0)
  })
  it('pulls a slow ball that is already over/touching the black', () => {
    const slow: BallState = { p: { x: 0.5 - hole.cupRadius, y: 0.5 }, v: { x: 0, y: 0 } }
    const next = step(slow, [], 8, hole)
    expect(next.v.x).toBeGreaterThan(0) // tugged toward the center
  })
  it('putts over the hole drop at any speed; hot edge-grazes skate past', () => {
    // Roll straight up the board at the given x; report whether it dropped
    // BEFORE bouncing off the far wall (rebound sinks are legitimate golf).
    const firstPassSinks = (v0: number, x: number): boolean => {
      let ball: BallState = { p: { x, y: 0.78 }, v: { x: 0, y: -v0 } }
      for (let i = 0; i < 3000; i += 1) {
        ball = step(ball, [], 8, hole)
        if (inCup(ball, hole)) return true
        if (ball.v.y > 0 || atRest(ball)) return false // bounced back or died
      }
      return false
    }
    expect(firstPassSinks(1.05, 0.5)).toBe(true) // measured pace drops in
    expect(firstPassSinks(MAX_POWER, 0.5)).toBe(true) // dead-center blast STILL drops — no skating over open air
    expect(firstPassSinks(MAX_POWER, 0.5 + hole.cupRadius * 0.85)).toBe(false) // hot graze lips out
  })
  it('a flying ball sails over the cup', () => {
    expect(inCup({ p: { x: 0.5, y: 0.5 }, v: { x: 0.1, y: 0 }, air: 200 }, hole)).toBe(false)
  })
})

describe('sand', () => {
  const hole = bareHole({ hazards: [{ p: { x: 0.5, y: 0.5 }, r: 0.1, kind: 'sand' }] })
  it('detects the ball in/out of sand', () => {
    expect(inSand({ p: { x: 0.5, y: 0.5 }, v: { x: 0, y: 0 } }, hole)).toBe(true)
    expect(inSand({ p: { x: 0.1, y: 0.1 }, v: { x: 0, y: 0 } }, hole)).toBe(false)
  })
  it('drags the ball far harder than open green', () => {
    const run = (withSand: boolean): number => {
      let ball: BallState = { p: { x: 0.5, y: 0.9 }, v: { x: 0, y: -1.0 } }
      const h = withSand ? hole : bareHole()
      for (let i = 0; i < 3000 && !atRest(ball); i += 1) ball = step(ball, [], 8, h)
      return ball.p.y // how far up the board it got (smaller = further)
    }
    expect(run(true)).toBeGreaterThan(run(false) + 0.08) // sand stopped it much shorter
  })
  it('sand never swallows the ball (it is not water)', () => {
    expect(inWater({ p: { x: 0.5, y: 0.5 }, v: { x: 0, y: 0 } }, hole)).toBe(false)
  })
})

describe('voids (drop-offs)', () => {
  const hole = bareHole({ voids: [{ x: 0, y: 0.4, w: 0.2, h: 0.2 }] })
  it('a grounded ball in a void has fallen off; a flying one has not', () => {
    expect(inVoid({ p: { x: 0.1, y: 0.5 }, v: { x: 0, y: 0 } }, hole)).toBe(true)
    expect(inVoid({ p: { x: 0.1, y: 0.5 }, v: { x: 0, y: 0 }, air: 150 }, hole)).toBe(false)
    expect(inVoid({ p: { x: 0.5, y: 0.5 }, v: { x: 0, y: 0 } }, hole)).toBe(false)
  })
  it('excludes bank points on a rail that has fallen away', () => {
    // Cup and start aligned so the LEFT rail bank would land inside the void
    // strip; the solver must not offer that rail.
    const h = bareHole({
      start: { x: 0.3, y: 0.9 },
      cup: { x: 0.3, y: 0.15 },
      walls: [{ x: 0.05, y: 0.5, w: 0.6, h: 0.035 }], // blocks the direct line
      voids: [{ x: 0, y: 0.3, w: 0.06, h: 0.5 }], // left rail gone at bank height
    })
    const sol = solveHole(h)
    // A solution may still exist off the other rails, but never through the void.
    if (sol && sol.pathType === 'bank') {
      const t = routeTarget(h.start, h)!
      expect(t.x).toBeGreaterThan(0.06 + BALL_RADIUS) // not the fallen left rail
    }
  })
})

describe('jump ramps', () => {
  const hole = bareHole({
    ramps: [{ rect: { x: 0.45, y: 0.6, w: 0.1, h: 0.07 }, dir: { x: 0, y: -1 } }],
    walls: [{ x: 0.2, y: 0.45, w: 0.6, h: 0.035 }], // a wall right after the ramp
  })
  it('launches a fast ball airborne on entry', () => {
    let ball: BallState = { p: { x: 0.5, y: 0.75 }, v: { x: 0, y: -1.2 } }
    let flew = false
    for (let i = 0; i < 200; i += 1) {
      ball = step(ball, hole.walls, 8, hole)
      if (airborne(ball)) {
        flew = true
        break
      }
    }
    expect(flew).toBe(true)
  })
  it('a slow roll just trundles across the plate', () => {
    let ball: BallState = { p: { x: 0.5, y: 0.7 }, v: { x: 0, y: -(RAMP_MIN_SPEED * 0.7) } }
    for (let i = 0; i < 400 && !atRest(ball); i += 1) {
      ball = step(ball, hole.walls, 8, hole)
      expect(airborne(ball)).toBe(false)
    }
  })
  it('an airborne ball flies OVER walls and lands beyond them', () => {
    let ball: BallState = { p: { x: 0.5, y: 0.75 }, v: { x: 0, y: -1.3 } }
    for (let i = 0; i < 1000; i += 1) {
      ball = step(ball, hole.walls, 8, hole)
      if (!airborne(ball) && ball.p.y < 0.6) break
    }
    // The wall spans y=0.45..0.485; a grounded ball could never cross it going
    // up. The jump carried it past.
    expect(ball.p.y).toBeLessThan(0.45)
  })
  it('launches along the RAMP’s facing, not the entry heading', () => {
    const kicker = bareHole({
      ramps: [{ rect: { x: 0.45, y: 0.6, w: 0.1, h: 0.07 }, dir: { x: 1, y: 0 } }],
    })
    let ball: BallState = { p: { x: 0.5, y: 0.75 }, v: { x: 0, y: -1.2 } } // rolling straight up
    for (let i = 0; i < 200; i += 1) {
      ball = step(ball, [], 8, kicker)
      if (airborne(ball)) break
    }
    expect(airborne(ball)).toBe(true)
    expect(ball.v.x).toBeGreaterThan(1) // kicked sideways, where the chevrons point
    expect(Math.abs(ball.v.y)).toBeLessThan(0.01)
  })
})

describe('aiming', () => {
  it('fires opposite the drag and never exceeds MAX_POWER', () => {
    const v = aimToVelocity({ x: 3, y: -4 }, 5)
    expect(v.x).toBeLessThan(0)
    expect(v.y).toBeGreaterThan(0)
    expect(speed(v)).toBeCloseTo(MAX_POWER)
  })
  it('planPutt: a real drag is one stroke, a tiny drag cancels, power caps at 1', () => {
    expect(planPutt({ x: 100, y: 0 }, 300, 0.38).counts).toBe(true)
    const tiny = CANCEL_POWER * 0.38 * 300 * 0.5
    expect(planPutt({ x: tiny, y: 0 }, 300, 0.38).counts).toBe(false)
    expect(planPutt({ x: 100000, y: 0 }, 300, 0.38).power).toBe(1)
  })
})

describe('makeHole (generation)', () => {
  it('is deterministic, well-formed, and the cup shrinks over the course', () => {
    for (const seed of SEEDS) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        expect(makeHole(i, seed)).toEqual(h)
        expect(h.start.y).toBeGreaterThan(h.cup.y)
        expect(h.par).toBeGreaterThanOrEqual(2)
        expect(h.par).toBeLessThanOrEqual(6)
        for (const w of h.walls) {
          expect(w.x).toBeGreaterThanOrEqual(0)
          expect(w.x + w.w).toBeLessThanOrEqual(1.0001)
        }
      }
      expect(makeHole(COURSE_HOLES - 1, seed).cupRadius).toBeLessThan(makeHole(0, seed).cupRadius)
    }
  })
  it('the cup is only barely bigger than the ball', () => {
    for (const seed of SEEDS) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        expect(h.cupRadius).toBeGreaterThan(BALL_RADIUS)
        expect(h.cupRadius).toBeLessThanOrEqual(BALL_RADIUS * 1.45)
      }
    }
  })
  it('sand grows more likely each round, hitting ~90% by the finale', () => {
    const manySeeds = Array.from({ length: 24 }, (_, i) => `sand-stat-${i}`)
    const sandRate = (index: number): number => {
      let holesWithSand = 0
      for (const seed of manySeeds) {
        if (makeHole(index, seed).hazards.some((h) => h.kind === 'sand')) holesWithSand += 1
      }
      return holesWithSand / manySeeds.length
    }
    const early = sandRate(0)
    const late = sandRate(COURSE_HOLES - 1)
    expect(early).toBeLessThan(0.5)
    expect(late).toBeGreaterThan(0.65)
    expect(late).toBeGreaterThan(early)
  })
  it('the board is often DRAMATICALLY not a square, with both railed and treacherous outlines', () => {
    const area = (r: { w: number; h: number }) => r.w * r.h
    let cutPieces = 0
    let dramatic = 0
    let islands = 0
    let bigChasms = 0
    for (const seed of [...SEEDS, 'r1', 'r2', 'r3', 'r4', 'r5']) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        const shapeArea = [...h.cuts, ...h.voids].reduce((a, r) => a + area(r), 0)
        if (shapeArea >= 0.15) dramatic += 1
        for (const c of h.cuts) {
          cutPieces += 1
          // Tee and cup are never inside a solid piece.
          expect(c.x <= h.start.x && h.start.x <= c.x + c.w && c.y <= h.start.y && h.start.y <= c.y + c.h).toBe(false)
          expect(c.x <= h.cup.x && h.cup.x <= c.x + c.w && c.y <= h.cup.y && h.cup.y <= c.y + c.h).toBe(false)
          // Cuts are solid: they participate in the physics wall set.
          expect(effectiveWalls(h, 0)).toContainEqual(c)
        }
        // Interior islands (donut/eight/amoeba cores) — not edge-anchored.
        for (const r of [...h.cuts, ...h.voids]) {
          if (r.x > 0.01 && r.x + r.w < 0.99 && r.y > 0.01 && r.y + r.h < 0.99) islands += 1
          else if (area(r) >= 0.06 && h.voids.includes(r)) bigChasms += 1
        }
      }
    }
    expect(cutPieces).toBeGreaterThan(10)
    expect(dramatic).toBeGreaterThan(15) // Ls, serpents, Ws — not nibbles
    expect(islands).toBeGreaterThan(3) // donuts and eights exist
    expect(bigChasms).toBeGreaterThan(3) // some outlines are treacherous, not railed
  })
  it('every waypoint route is made of genuinely puttable straight legs', () => {
    for (const seed of SEEDS) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        const wps = routeWaypoints(h.start, h)
        expect(wps, `seed ${seed} hole ${i + 1}`).not.toBeNull()
        const last = wps![wps!.length - 1]
        expect(Math.hypot(last.x - h.cup.x, last.y - h.cup.y)).toBeLessThan(0.001)
      }
    }
  })
  it('a ball rolled at a shape cut banks off its rail instead of entering', () => {
    const h = bareHole({ cuts: [{ x: 0, y: 0.3, w: 0.2, h: 0.3 }] })
    let ball: BallState = { p: { x: 0.5, y: 0.45 }, v: { x: -1.2, y: 0 } }
    for (let i = 0; i < 2000; i += 1) {
      ball = step(ball, effectiveWalls(h, 0), 8, h)
      // Never inside the cut.
      expect(ball.p.x >= 0.2 - 0.001 || ball.p.y < 0.3 || ball.p.y > 0.6).toBe(true)
      if (atRest(ball)) break
    }
    expect(ball.p.x).toBeGreaterThan(0.2) // came to rest on the course side
  })
  it('ramps usually do NOT point at the flag (and dir is a unit vector)', () => {
    let skewed = 0
    const ramps: Array<{ ang: number }> = []
    for (const seed of [...SEEDS, 'r1', 'r2', 'r3', 'r4', 'r5']) {
      for (let i = 6; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        for (const r of h.ramps) {
          expect(Math.hypot(r.dir.x, r.dir.y)).toBeCloseTo(1, 3)
          const c = { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }
          const toCup = Math.atan2(h.cup.y - c.y, h.cup.x - c.x)
          const rampAng = Math.atan2(r.dir.y, r.dir.x)
          let d = Math.abs(rampAng - toCup)
          if (d > Math.PI) d = 2 * Math.PI - d
          ramps.push({ ang: d })
          if (d > 0.2) skewed += 1
        }
      }
    }
    expect(ramps.length).toBeGreaterThan(5)
    expect(skewed / ramps.length).toBeGreaterThan(0.6)
  })
  it('hazards never stack: pairwise clear of each other, the tee and the cup', () => {
    for (const seed of SEEDS) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        for (let a = 0; a < h.hazards.length; a += 1) {
          for (let b = a + 1; b < h.hazards.length; b += 1) {
            const d = Math.hypot(
              h.hazards[a].p.x - h.hazards[b].p.x,
              h.hazards[a].p.y - h.hazards[b].p.y,
            )
            expect(d).toBeGreaterThanOrEqual(h.hazards[a].r + h.hazards[b].r)
          }
          const hz = h.hazards[a]
          expect(Math.hypot(hz.p.x - h.start.x, hz.p.y - h.start.y)).toBeGreaterThan(hz.r + 0.09)
          expect(Math.hypot(hz.p.x - h.cup.x, hz.p.y - h.cup.y)).toBeGreaterThan(hz.r + h.cupRadius)
        }
      }
    }
  })
  it('every moving wall sweeps ACROSS the corridor (axis x), fenced in bounds', () => {
    for (const seed of SEEDS) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        for (const m of makeHole(i, seed).movers) {
          expect(m.axis).toBe('x')
          const env = moverEnvelope(m)
          expect(env.x).toBeGreaterThanOrEqual(0)
          expect(env.x + env.w).toBeLessThanOrEqual(1.0001)
          // And it really moves: sample quarter-period points (a half-period
          // pair can alias to ~zero for phases near 0/π).
          const T = ((2 * Math.PI) / m.speed) * 1000
          const xs = [0, T / 4, T / 2, (3 * T) / 4].map((t) => moverRectAt(m, t).x)
          expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.05)
        }
      }
    }
  })
  it('the course actually uses its toys: water, sand, movers, voids and ramps all appear', () => {
    const counts = { water: 0, sand: 0, movers: 0, voids: 0, ramps: 0 }
    for (const seed of SEEDS) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        counts.water += h.hazards.filter((z) => z.kind === 'water').length
        counts.sand += h.hazards.filter((z) => z.kind === 'sand').length
        counts.movers += h.movers.length
        counts.voids += h.voids.length
        counts.ramps += h.ramps.length
      }
    }
    expect(counts.water).toBeGreaterThan(5)
    expect(counts.sand).toBeGreaterThan(5)
    expect(counts.movers).toBeGreaterThan(4)
    expect(counts.voids).toBeGreaterThan(3)
    expect(counts.ramps).toBeGreaterThan(2)
  })
})

describe('winnability + no free straight shots', () => {
  it('every generated hole across many seeds is winnable', () => {
    for (const seed of [...SEEDS, 'qqqq', '01234']) {
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        expect(h.winnable).toBe(true)
        // The waypoint router is the winnability authority; the one-bank
        // solver may legitimately fail on serpentine/donut boards.
        expect(isWinnable(h)).toBe(true)
      }
    }
  })
  it('no hole past the first is ever a naked green (some structure always present)', () => {
    for (const seed of [...SEEDS, 'r1', 'r2', 'r3', 'r4', 'r5', 'qqqq', '01234']) {
      for (let i = 1; i < COURSE_HOLES; i += 1) {
        const h = makeHole(i, seed)
        // Structure = bars, railed outline pieces, or chasm outline pieces — a
        // serpent made entirely of drop-offs blocks the line without a bar.
        expect(
          h.walls.length + h.cuts.length + h.voids.length,
          `seed ${seed} hole ${i + 1}`,
        ).toBeGreaterThan(0)
      }
    }
  })
  it('from hole 2 on, the direct tee→cup line is (almost) always blocked', () => {
    let blocked = 0
    let total = 0
    for (const seed of SEEDS) {
      for (let i = 1; i < COURSE_HOLES; i += 1) {
        total += 1
        // solveHole returns 'direct' only when the straight ace is open; a
        // 'bank' or null (multi-leg board) both mean the line is blocked.
        if (solveHole(makeHole(i, seed))?.pathType !== 'direct') blocked += 1
      }
    }
    expect(blocked / total).toBeGreaterThan(0.9)
  })
  it('reports a hole with the cup walled off as unsolvable', () => {
    const boxed = bareHole({
      cup: { x: 0.5, y: 0.12 },
      walls: [
        { x: 0.3, y: 0.02, w: 0.4, h: 0.03 },
        { x: 0.3, y: 0.22, w: 0.4, h: 0.03 },
        { x: 0.3, y: 0.02, w: 0.03, h: 0.23 },
        { x: 0.67, y: 0.02, w: 0.03, h: 0.23 },
      ],
      winnable: false,
    })
    expect(solveHole(boxed)).toBeNull()
    expect(isWinnable(boxed)).toBe(false)
  })
})

describe('par derivation', () => {
  it('a short, clear hole is par 2; a forced bank starts at 3', () => {
    const clear = bareHole({ start: { x: 0.5, y: 0.6 }, cup: { x: 0.5, y: 0.3 } })
    expect(derivePar(clear, solveHole(clear)!)).toBe(2)
  })
  it('bumps only for kitchen-sink holes (4+ features), never stacks', () => {
    const busy = bareHole({
      start: { x: 0.5, y: 0.9 },
      cup: { x: 0.5, y: 0.1 },
      hazards: [
        { p: { x: 0.2, y: 0.5 }, r: 0.06, kind: 'water' },
        { p: { x: 0.8, y: 0.4 }, r: 0.08, kind: 'sand' },
      ],
    })
    expect(derivePar(busy, solveHole(busy)!)).toBe(2) // direct + 2 features: no bump
    const sink = bareHole({
      ...busy,
      voids: [
        { x: 0, y: 0.55, w: 0.15, h: 0.15 },
        { x: 0.85, y: 0.6, w: 0.15, h: 0.15 },
      ],
    })
    expect(derivePar(sink, solveHole(sink)!)).toBe(3) // 4 features: +1
  })
  it('course par trends upward as holes get harder', () => {
    const sum = (seed: string, from: number, to: number) => {
      let s = 0
      for (let i = from; i <= to; i += 1) s += makeHole(i, seed).par
      return s
    }
    for (const seed of SEEDS) {
      expect(sum(seed, 6, 8)).toBeGreaterThan(sum(seed, 0, 2))
    }
  })
})

// ---------------------------------------------------------------------------
// Playability: a simulated player plays every hole of every seed to completion.
// The bot aims exactly along the routes the solvability planner guarantees
// (direct when clear, else a one-bank rail), with physics-derived power — if it
// can finish every hole in a handful of strokes, a human always can too.
// ---------------------------------------------------------------------------
describe('simulated player completes every course', () => {
  const shoot = (from: Vec, target: Vec, arrive: number): BallState => {
    const d = Math.hypot(target.x - from.x, target.y - from.y) || 1e-6
    // Exponential friction loses speed ~linearly with distance (dv/dx = -f),
    // so launch speed = desired arrival speed + FRICTION * distance.
    const sp = Math.min(MAX_POWER, arrive + FRICTION * d)
    return {
      p: { ...from },
      v: { x: ((target.x - from.x) / d) * sp, y: ((target.y - from.y) / d) * sp },
      air: 0,
    }
  }

  const playHole = (hole: Hole): number => {
    let ball: BallState = { p: { ...hole.start }, v: { x: 0, y: 0 }, air: 0 }
    let simMs = 0
    for (let stroke = 1; stroke <= 14; stroke += 1) {
      // Follow the waypoint route from here; if boxed in, re-plan from the tee
      // route — what a human does — before firing blind at the cup.
      const wps = routeWaypoints(ball.p, hole) ?? routeWaypoints(hole.start, hole) ?? [{ ...hole.cup }]
      const target = { ...wps[0] }
      const lastLeg = wps.length === 1
      // A struggling human varies the line a touch instead of repeating the
      // exact shot — mirror that so one bad interaction can't loop forever.
      if (stroke > 4) target.x += ((stroke % 3) - 1) * 0.02
      // Intermediate waypoints hug obstacle corners — arrive nearly stopped so
      // overshoot can't carry past the corner into the hazard behind it.
      const carry = lastLeg ? 0.12 : 0.04
      ball = shoot(ball.p, target, carry)
      // Simulate until the ball rests, sinks, or is lost.
      for (let i = 0; i < 4000; i += 1) {
        ball = step(ball, effectiveWalls(hole, simMs), 8, hole)
        simMs += 8
        if (airborne(ball)) continue
        if (inVoid(ball, hole) || inWater(ball, hole)) {
          ball = { p: { ...hole.start }, v: { x: 0, y: 0 }, air: 0 }
          break
        }
        if (inCup(ball, hole)) return stroke
        if (atRest(ball)) break
      }
    }
    return Number.POSITIVE_INFINITY
  }

  it('sinks all 9 holes of five seeds within 14 strokes each (and sanely overall)', () => {
    for (const seed of SEEDS) {
      let courseStrokes = 0
      for (let i = 0; i < COURSE_HOLES; i += 1) {
        const strokes = playHole(makeHole(i, seed))
        expect(strokes, `seed ${seed} hole ${i + 1}`).toBeLessThanOrEqual(14)
        courseStrokes += strokes
      }
      // The dumb bot should land in a believable scoring band — proof the
      // course is hard enough to matter but nowhere near unfair.
      expect(courseStrokes, `seed ${seed} course total`).toBeLessThanOrEqual(60)
    }
  })
})

describe('result taglines', () => {
  it('names the right golf term for each score vs par', () => {
    const fixed = () => 0
    expect(holeResult(1, 4, fixed).term).toBe('Hole in one!')
    expect(holeResult(2, 4, fixed).term).toBe('Eagle!')
    expect(holeResult(3, 4, fixed).term).toBe('Birdie')
    expect(holeResult(4, 4, fixed).term).toBe('Par')
    expect(holeResult(5, 4, fixed).term).toBe('Bogey')
    expect(holeResult(6, 4, fixed).term).toBe('Double bogey')
    expect(holeResult(8, 4, fixed).term).toBe('Blow-up hole')
  })
  it('summarises a round under/at/over par', () => {
    const fixed = () => 0
    expect(courseResult(25, 27, fixed).term).toBe('Under par!')
    expect(courseResult(27, 27, fixed).term).toBe('Even par')
    expect(courseResult(30, 27, fixed).term).toBe('Just over par')
    expect(courseResult(40, 27, fixed).term).toBe('Room to improve')
  })
})
