/**
 * Mini Golf — physics, course generation, solvability, par and scoring. Pure and
 * testable. The view drives a fixed-timestep simulation and renders; this module
 * owns the ball integrator, wall reflection, hole capture, hazards, moving
 * obstacles, seeded hole layouts, a solvability guarantee, par derivation and the
 * golf-language result taglines.
 *
 * Coordinates are fractions of the (square) play area: x,y in [0,1]. Holes run
 * bottom (tee, larger y) to top (cup, smaller y). Velocities are per second.
 */

import { rngFromSeed } from './seed'

export interface Vec {
  x: number
  y: number
}

export interface BallState {
  p: Vec
  v: Vec
}

/** An axis-aligned wall rectangle the ball bounces off (fractions of the area). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A pit/water hazard: if the ball's centre enters, it resets to the tee. The
 *  swing that sent it there is already spent, so a hazard costs the player. */
export interface Hazard {
  p: Vec
  r: number
}

/** A wall that oscillates back and forth along one axis (harder-hole variety). */
export interface MovingWall {
  base: Rect
  axis: 'x' | 'y'
  amp: number // travel distance (fraction of area)
  speed: number // radians/second
  phase: number // radians offset
}

export type PathType = 'direct' | 'bank'

export interface Hole {
  index: number
  start: Vec
  cup: Vec
  cupRadius: number
  walls: Rect[]
  hazards: Hazard[]
  movers: MovingWall[]
  par: number
  seed: string
  winnable: boolean
}

export const BALL_RADIUS = 0.022
export const FRICTION = 1.2 // velocity halving-ish drag per second (see step)
export const STOP_SPEED = 0.02 // below this the ball is considered at rest
export const MAX_POWER = 1.6 // max launch speed from a full-strength stroke
export const CAPTURE_SPEED = 1.0 // ball must be slower than this to drop in the cup
export const CANCEL_POWER = 0.06 // drags weaker than this cancel (no stroke)
export const COURSE_HOLES = 9

// The cup grabs at the ball like a real one: rolling across its rim bleeds off
// speed (RIM_DRAG, applied within RIM_REACH of the cup) and a slow-enough ball
// nearby gets pulled toward the center (RIM_PULL). Together these stop a
// well-aimed putt from skating straight over the hole at speed.
export const RIM_REACH = 1.8 // in cup radii
export const RIM_DRAG = 2.6 // extra exponential drag per second over the rim
export const RIM_PULL = 0.5 // pull acceleration toward the cup when slow

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const clamp01 = (v: number, r: number) => Math.max(r, Math.min(1 - r, v))
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

/** Reflect the ball off the outer bounds and any wall rectangles (one step). */
export function collide(state: BallState, walls: Rect[]): BallState {
  let { x: px, y: py } = state.p
  let { x: vx, y: vy } = state.v
  const r = BALL_RADIUS

  // Outer walls
  if (px < r) {
    px = r
    vx = Math.abs(vx)
  } else if (px > 1 - r) {
    px = 1 - r
    vx = -Math.abs(vx)
  }
  if (py < r) {
    py = r
    vy = Math.abs(vy)
  } else if (py > 1 - r) {
    py = 1 - r
    vy = -Math.abs(vy)
  }

  // Inner wall rectangles: push the ball out along the shallowest axis and flip
  // that velocity component.
  for (const w of walls) {
    const nearestX = Math.max(w.x, Math.min(px, w.x + w.w))
    const nearestY = Math.max(w.y, Math.min(py, w.y + w.h))
    const dx = px - nearestX
    const dy = py - nearestY
    if (dx * dx + dy * dy >= r * r) continue // no overlap

    // Determine penetration on each axis to pick the reflection normal.
    const overlapLeft = px - w.x
    const overlapRight = w.x + w.w - px
    const overlapTop = py - w.y
    const overlapBottom = w.y + w.h - py
    const minX = Math.min(overlapLeft, overlapRight)
    const minY = Math.min(overlapTop, overlapBottom)
    if (minX < minY) {
      if (overlapLeft < overlapRight) {
        px = w.x - r
        vx = -Math.abs(vx)
      } else {
        px = w.x + w.w + r
        vx = Math.abs(vx)
      }
    } else if (overlapTop < overlapBottom) {
      py = w.y - r
      vy = -Math.abs(vy)
    } else {
      py = w.y + w.h + r
      vy = Math.abs(vy)
    }
  }

  // Re-clamp: pushing out of an inner wall must never leave the play area.
  px = Math.max(r, Math.min(1 - r, px))
  py = Math.max(r, Math.min(1 - r, py))

  return { p: { x: px, y: py }, v: { x: vx, y: vy } }
}

/**
 * Advance the ball one fixed step: integrate, apply friction (plus the cup's
 * rim drag/pull when a hole is provided), then collide.
 */
export function step(state: BallState, walls: Rect[], dtMs: number, hole?: Hole): BallState {
  const dt = dtMs / 1000
  const moved: BallState = {
    p: { x: state.p.x + state.v.x * dt, y: state.p.y + state.v.y * dt },
    v: { x: state.v.x, y: state.v.y },
  }
  // Exponential friction.
  let decay = Math.exp(-FRICTION * dt)
  if (hole) {
    const d = dist(moved.p, hole.cup)
    if (d < hole.cupRadius * RIM_REACH) {
      // Rolling over the cup: the rim scrubs speed off...
      decay *= Math.exp(-RIM_DRAG * dt)
      // ...and pulls a slow ball toward the center so it drops instead of lipping.
      if (speed(moved.v) < CAPTURE_SPEED * 1.4 && d > 1e-6) {
        const pull = (RIM_PULL * dt) / d
        moved.v.x += (hole.cup.x - moved.p.x) * pull
        moved.v.y += (hole.cup.y - moved.p.y) * pull
      }
    }
  }
  moved.v.x *= decay
  moved.v.y *= decay
  return collide(moved, walls)
}

export const speed = (v: Vec): number => Math.hypot(v.x, v.y)
export const atRest = (state: BallState): boolean => speed(state.v) < STOP_SPEED

/** Whether the ball is over the cup and slow enough to be captured. */
export function inCup(state: BallState, hole: Hole): boolean {
  return dist(state.p, hole.cup) < hole.cupRadius && speed(state.v) < CAPTURE_SPEED
}

/** Whether the ball's centre has fallen into any pit hazard. */
export function inHazard(state: BallState, hole: Hole): boolean {
  return hole.hazards.some((h) => dist(state.p, h.p) < h.r)
}

// ---------------------------------------------------------------------------
// Moving walls
// ---------------------------------------------------------------------------

/** The rectangle a moving wall occupies at time `tMs` (ms since hole start). */
export function moverRectAt(m: MovingWall, tMs: number): Rect {
  const off = m.amp * (0.5 + 0.5 * Math.sin((m.speed * tMs) / 1000 + m.phase))
  return m.axis === 'x'
    ? { x: m.base.x + off, y: m.base.y, w: m.base.w, h: m.base.h }
    : { x: m.base.x, y: m.base.y + off, w: m.base.w, h: m.base.h }
}

/** The full swept bounding box a moving wall can ever occupy. Used both to keep
 *  planning conservative (guaranteed winnable at any phase) and to fence it in. */
export function moverEnvelope(m: MovingWall): Rect {
  return m.axis === 'x'
    ? { x: m.base.x, y: m.base.y, w: m.base.w + m.amp, h: m.base.h }
    : { x: m.base.x, y: m.base.y, w: m.base.w, h: m.base.h + m.amp }
}

/** All solid rectangles in effect at time `tMs`: static walls + live movers. */
export function effectiveWalls(hole: Hole, tMs: number): Rect[] {
  return [...hole.walls, ...hole.movers.map((m) => moverRectAt(m, tMs))]
}

// ---------------------------------------------------------------------------
// Aiming / scoring
// ---------------------------------------------------------------------------

/**
 * Build a launch velocity from an aim vector (drag from the ball). `power` is
 * 0..1 of MAX_POWER; the ball fires opposite the drag (pull-back-to-shoot).
 */
export function aimToVelocity(drag: Vec, power: number): Vec {
  const len = Math.hypot(drag.x, drag.y) || 1
  const p = Math.max(0, Math.min(1, power)) * MAX_POWER
  return { x: (-drag.x / len) * p, y: (-drag.y / len) * p }
}

export interface Putt {
  power: number
  velocity: Vec
  counts: boolean // whether this swing should register as a stroke
}

/**
 * Resolve a drag (in pixels) into a putt. Drags weaker than CANCEL_POWER don't
 * count (the player tapped/cancelled); every other release is exactly one
 * stroke. Centralising this keeps stroke counting honest and unit-testable.
 */
export function planPutt(dragPx: Vec, boardPx: number, maxDragFrac: number): Putt {
  const len = Math.hypot(dragPx.x, dragPx.y)
  const power = Math.min(1, len / (maxDragFrac * boardPx || 1))
  if (power < CANCEL_POWER) return { power, velocity: { x: 0, y: 0 }, counts: false }
  const velocity = aimToVelocity({ x: dragPx.x / boardPx, y: dragPx.y / boardPx }, power)
  return { power, velocity, counts: true }
}

// ---------------------------------------------------------------------------
// Geometry: line-of-sight and one-bank reachability (solvability + par)
// ---------------------------------------------------------------------------

/** Does the segment a→b intersect an axis-aligned rect grown by `margin`? */
function segHitsRect(a: Vec, b: Vec, rect: Rect, margin: number): boolean {
  const minX = rect.x - margin
  const minY = rect.y - margin
  const maxX = rect.x + rect.w + margin
  const maxY = rect.y + rect.h + margin
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (
    clip(-dx, a.x - minX) &&
    clip(dx, maxX - a.x) &&
    clip(-dy, a.y - minY) &&
    clip(dy, maxY - a.y)
  ) {
    return t0 <= t1
  }
  return false
}

/** Does the segment a→b pass within `radius` of point c? */
function segHitsCircle(a: Vec, b: Vec, c: Vec, radius: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1
  let t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y) < radius
}

interface Obstacles {
  rects: Rect[]
  circles: Hazard[]
}

/** The obstacle set a putt must avoid: static walls, the full sweep of every
 *  moving wall, and every hazard. Using mover ENVELOPES keeps a found path valid
 *  no matter the wall's phase, so the hole stays winnable at all times. */
function holeObstacles(hole: Hole): Obstacles {
  return {
    rects: [...hole.walls, ...hole.movers.map(moverEnvelope)],
    circles: hole.hazards,
  }
}

/** Is the straight path a→b clear of every obstacle (ball radius accounted)? */
function clearPath(a: Vec, b: Vec, obs: Obstacles): boolean {
  for (const r of obs.rects) if (segHitsRect(a, b, r, BALL_RADIUS)) return false
  for (const c of obs.circles) if (segHitsCircle(a, b, c.p, c.r + BALL_RADIUS)) return false
  return true
}

/** Where a start→cup shot would bank off the reflecting line `at` on `axis`. */
function bankPoint(start: Vec, cup: Vec, axis: 'x' | 'y', at: number): Vec | null {
  const r = BALL_RADIUS
  if (axis === 'x') {
    const mirroredX = 2 * at - cup.x
    const denom = mirroredX - start.x
    if (Math.abs(denom) < 1e-6) return null
    const t = (at - start.x) / denom
    if (t <= 0 || t >= 1) return null
    const y = start.y + t * (cup.y - start.y)
    if (y < r || y > 1 - r) return null
    return { x: at, y }
  }
  const mirroredY = 2 * at - cup.y
  const denom = mirroredY - start.y
  if (Math.abs(denom) < 1e-6) return null
  const t = (at - start.y) / denom
  if (t <= 0 || t >= 1) return null
  const x = start.x + t * (cup.x - start.x)
  if (x < r || x > 1 - r) return null
  return { x, y: at }
}

export interface Solution {
  pathType: PathType
  strokes: number // idealised strokes to sink from the tee (1 = ace line)
}

/**
 * Find a guaranteed-clear route from tee to cup: a direct line, else a single
 * bank off any of the four rails. Returns null when the hole cannot be solved
 * this way — the generator then regenerates or clears the layout.
 */
export function solveHole(hole: Hole): Solution | null {
  const obs = holeObstacles(hole)
  if (clearPath(hole.start, hole.cup, obs)) return { pathType: 'direct', strokes: 1 }
  const r = BALL_RADIUS
  const rails: Array<['x' | 'y', number]> = [
    ['x', r],
    ['x', 1 - r],
    ['y', r],
    ['y', 1 - r],
  ]
  for (const [axis, at] of rails) {
    const b = bankPoint(hole.start, hole.cup, axis, at)
    if (b && clearPath(hole.start, b, obs) && clearPath(b, hole.cup, obs)) {
      return { pathType: 'bank', strokes: 2 }
    }
  }
  return null
}

export const isWinnable = (hole: Hole): boolean => solveHole(hole) !== null

/**
 * Par from the hole's real difficulty: base on the shortest route type (a clear
 * direct line is a two-putt; a forced bank is three), plus at most ONE bump for
 * a green that is both long and busy. Bounded 2..4 — an honest target rather
 * than free strokes.
 */
export function derivePar(hole: Hole, sol: Solution): number {
  let par = sol.pathType === 'direct' ? 2 : 3
  if (dist(hole.start, hole.cup) >= 0.72 && hole.hazards.length + hole.movers.length > 0) par += 1
  return clamp(par, 2, 4)
}

// ---------------------------------------------------------------------------
// Hole generation (progressive difficulty + solvability guarantee)
// ---------------------------------------------------------------------------

function buildCandidate(index: number, seed: string, salt: number): Hole {
  const rng = rngFromSeed(`golf:${seed}:${index}:${salt}`)
  const t = index / (COURSE_HOLES - 1) // 0 (first) .. 1 (last): difficulty ramp

  // Longer greens on later holes.
  const startY = 0.8 + t * 0.1
  const cupY = 0.28 - t * 0.16
  const start: Vec = { x: clamp01(0.5 + (rng() - 0.5) * 0.5, BALL_RADIUS), y: startY }
  const cup: Vec = { x: clamp01(0.5 + (rng() - 0.5) * 0.7, 0.06), y: cupY }
  const span = start.y - cup.y

  // Walls. From the third hole on, the first wall is a deliberate BLOCKER laid
  // across the direct tee→cup line, so the straight ace stops being free and the
  // hole has to be played off the rails (solvability still guarantees a bank
  // route). The rest are decoration/bank targets, and never stack: a wall that
  // overlaps an already-placed one is skipped rather than piled on top.
  const walls: Rect[] = []
  const overlapsExisting = (r: Rect): boolean =>
    walls.some(
      (w) =>
        r.x < w.x + w.w + 0.02 &&
        r.x + r.w > w.x - 0.02 &&
        r.y < w.y + w.h + 0.02 &&
        r.y + r.h > w.y - 0.02,
    )
  if (index >= 2) {
    // A horizontal bar centered on the midpoint of the tee→cup segment.
    const midT = 0.4 + rng() * 0.25
    const mx = start.x + (cup.x - start.x) * midT
    const my = start.y + (cup.y - start.y) * midT
    const w = 0.3 + rng() * (0.2 + t * 0.25)
    walls.push({ x: clamp(mx - w / 2, 0.02, 0.98 - w), y: my - 0.0175, w, h: 0.035 })
  }
  const wallCount = Math.min(6, 1 + Math.round(t * 3) + Math.floor(rng() * 2))
  for (let i = 0; i < wallCount; i += 1) {
    const bandY = cup.y + 0.14 + ((i + 0.5) / wallCount) * (span - 0.28) + (rng() - 0.5) * 0.05
    // NOTE: the rng() call order here is the determinism contract for shared
    // seeds — reordering these draws reshapes every existing course.
    let cand: Rect
    if (rng() < 0.6) {
      const w = 0.24 + rng() * (0.22 + t * 0.22)
      cand = { x: clamp01(rng() * (1 - w), 0), y: bandY, w, h: 0.035 }
    } else {
      const h = 0.13 + rng() * (0.14 + t * 0.12)
      cand = { x: clamp(0.18 + rng() * 0.6, 0.05, 0.92), y: bandY - h / 2, w: 0.035, h }
    }
    if (!overlapsExisting(cand)) walls.push(cand)
  }

  // Pit hazards start appearing mid-course and grow more likely toward the end.
  const hazards: Hazard[] = []
  const addHazard = () => {
    const r = 0.05 + rng() * 0.03
    const p: Vec = {
      x: clamp(0.18 + rng() * 0.64, 0.12, 0.88),
      y: cup.y + 0.16 + rng() * Math.max(0.05, span - 0.32),
    }
    // Keep-away margins: past the tee, and past the cup's RADIUS (0.05) plus a
    // putting lane — this previously used cup.y (the cup's coordinate) by
    // mistake, which silently rejected most hazards on early holes.
    if (dist(p, start) > r + 0.1 && dist(p, cup) > r + 0.05 + 0.02) hazards.push({ p, r })
  }
  if (index >= 3 && rng() < 0.35 + t * 0.55) addHazard()
  if (index >= 6 && rng() < 0.5) addHazard()

  // A single sliding wall on the harder holes for timing variety. Its envelope
  // is fenced inside the green and kept narrow enough to leave a clear lane.
  const movers: MovingWall[] = []
  if (index >= 4 && rng() < 0.4 + (t - 0.4) * 0.6) {
    const horizontal = rng() < 0.5
    const midY = cup.y + 0.3 + rng() * Math.max(0.05, span - 0.5)
    if (horizontal) {
      const w = 0.16 + rng() * 0.08
      const amp = 0.34 + rng() * 0.12
      const x = clamp(0.08 + rng() * (1 - w - amp - 0.16), 0.05, 1 - w - amp - 0.05)
      movers.push({ base: { x, y: midY, w, h: 0.035 }, axis: 'x', amp, speed: 1 + rng() * 1, phase: rng() * 6.28 })
    } else {
      const h = 0.14 + rng() * 0.08
      const amp = 0.22 + rng() * 0.1
      const y = clamp(cup.y + 0.14 + rng() * 0.1, 0.06, 1 - h - amp - 0.05)
      const x = clamp(0.2 + rng() * 0.6, 0.06, 0.9)
      movers.push({ base: { x, y, w: 0.035, h }, axis: 'y', amp, speed: 1 + rng() * 1, phase: rng() * 6.28 })
    }
  }

  return { index, start, cup, cupRadius: 0.05, walls, hazards, movers, par: 2, seed, winnable: false }
}

/** Remove any walls/hazards/movers blocking the direct tee→cup line, guaranteeing
 *  a clear shot. The safety net when random layouts refuse to be solvable. */
function clearBlockers(hole: Hole): void {
  const line = (obs: Obstacles) => clearPath(hole.start, hole.cup, obs)
  hole.walls = hole.walls.filter((w) => line({ rects: [w], circles: [] }))
  hole.hazards = hole.hazards.filter((c) => line({ rects: [], circles: [c] }))
  hole.movers = hole.movers.filter((m) => line({ rects: [moverEnvelope(m)], circles: [] }))
}

/**
 * Generate a deterministic, always-winnable hole. Layouts are retried with new
 * salts until one is solvable (direct or one-bank); as a last resort blocking
 * obstacles are cleared so a direct shot always exists. Par is then derived from
 * the actual route + hazards, so it tracks real difficulty.
 */
export function makeHole(index: number, seed: string): Hole {
  // From the third hole on, prefer a layout whose best route is a BANK — the
  // blocker wall did its job and the hole actually asks for a shot. Fall back to
  // any solvable layout, then to clearing blockers.
  let fallback: { hole: Hole; sol: Solution } | null = null
  for (let salt = 0; salt < 24; salt += 1) {
    const hole = buildCandidate(index, seed, salt)
    const sol = solveHole(hole)
    if (!sol) continue
    if (index < 2 || sol.pathType === 'bank') {
      hole.par = derivePar(hole, sol)
      hole.winnable = true
      return hole
    }
    if (!fallback) fallback = { hole, sol }
  }
  if (fallback) {
    fallback.hole.par = derivePar(fallback.hole, fallback.sol)
    fallback.hole.winnable = true
    return fallback.hole
  }
  const hole = buildCandidate(index, seed, 0)
  clearBlockers(hole)
  const sol = solveHole(hole) ?? { pathType: 'direct' as PathType, strokes: 1 }
  hole.par = derivePar(hole, sol)
  hole.winnable = true
  return hole
}

// ---------------------------------------------------------------------------
// Result taglines (golf language, with variety)
// ---------------------------------------------------------------------------

export interface Result {
  term: string
  blurb: string
}

const pick = (arr: string[], rand: () => number): string => arr[Math.floor(rand() * arr.length) % arr.length]

/** A golf-language reaction to sinking a hole in `strokes` against `par`. */
export function holeResult(strokes: number, par: number, rand: () => number = Math.random): Result {
  if (strokes === 1) {
    return {
      term: 'Hole in one!',
      blurb: pick(['Ace! Absolutely pured it. 🎉', 'One and done — incredible!', 'A hole in one. Frame it.'], rand),
    }
  }
  const diff = strokes - par
  if (diff <= -3) {
    return { term: 'Albatross!', blurb: pick(['Three under on one hole — unreal.', 'An albatross! Almost never happens.'], rand) }
  }
  if (diff === -2) {
    return { term: 'Eagle!', blurb: pick(['Two under — soaring stuff. 🦅', 'An eagle! Superb line and pace.', 'Eagle. That was clinical.'], rand) }
  }
  if (diff === -1) {
    return { term: 'Birdie', blurb: pick(['One under par — lovely. 🐦', 'Birdie! Smooth as you like.', 'A birdie. Money.'], rand) }
  }
  if (diff === 0) {
    return { term: 'Par', blurb: pick(['Right on par — tidy.', 'Par. Steady golf.', 'Level par — no complaints.'], rand) }
  }
  if (diff === 1) {
    return { term: 'Bogey', blurb: pick(['One over — shake it off.', 'Bogey. Still in the fight.', 'A bogey — grind it back next hole.'], rand) }
  }
  if (diff === 2) {
    return { term: 'Double bogey', blurb: pick(['Two over — the green bit back.', 'Double bogey. Deep breath.', 'A double — regroup.'], rand) }
  }
  if (diff === 3) {
    return { term: 'Triple bogey', blurb: pick(['Three over — rough hole.', 'Triple bogey. Onwards.', 'That one got away.'], rand) }
  }
  return { term: 'Blow-up hole', blurb: pick(['Ouch — chalk it up and move on.', 'A snowman-ish score. It happens.', 'Well over par — next tee, fresh start.'], rand) }
}

/** A summary reaction to a completed round of `totalStrokes` against `totalPar`. */
export function courseResult(totalStrokes: number, totalPar: number, rand: () => number = Math.random): Result {
  const diff = totalStrokes - totalPar
  if (diff <= -4) return { term: 'Tour-level round!', blurb: pick(['Way under par across the nine. Sensational.', 'A round for the record books.'], rand) }
  if (diff < 0) return { term: 'Under par!', blurb: pick([`${-diff} under for the round — brilliant golf. 🏆`, 'Beat the course. Take a bow.'], rand) }
  if (diff === 0) return { term: 'Even par', blurb: pick(['Level with the course — rock solid.', 'Even par across nine. Consistent.'], rand) }
  if (diff <= 3) return { term: 'Just over par', blurb: pick([`${diff} over — a respectable card.`, 'So close to par. Run it back?'], rand) }
  return { term: 'Room to improve', blurb: pick(['Plenty over par — the course won today.', 'A tougher round. Another go?'], rand) }
}
