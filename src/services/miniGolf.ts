/**
 * Mini Golf — physics, course generation, solvability, par and scoring. Pure and
 * testable. The view drives a fixed-timestep simulation and renders; this module
 * owns the ball integrator, wall reflection, hole capture, hazards, moving
 * obstacles, seeded hole layouts, a solvability guarantee, par derivation and the
 * golf-language result taglines.
 *
 * The course teaches its mechanics one hole at a time and composes them:
 *   1. plain green (the only hole where a straight ace is even possible)
 *   2+ every hole is generated so the direct tee→cup line is BLOCKED — you
 *      play the rails (a one-bank route is always guaranteed clear)
 *   3+ WATER pools near the putting lanes (splash → back to the tee)
 *   4+ SAND patches (heavy drag — momentum dies in them)
 *   5+ MOVING walls that sweep ACROSS the corridor (gates and wipers)
 *   6+ VOIDS: corner bites and edge drop-offs where the green simply ends —
 *      roll in and you fall off (back to the tee); a rail beside a drop-off
 *      can't be banked
 *   7+ JUMP ramps on the blocked direct line: hit one fast and the ball goes
 *      airborne, flying over walls, water and voids — a risky ace line
 *   ...and the cup shrinks as the course goes on.
 *
 * The cup is honest: the black circle you see IS the capture zone. The ball
 * has to be over the black — and slow — to drop; there is no long-range pull.
 *
 * Coordinates are fractions of the board WIDTH: x in [0,1], y in [0, WORLD_H].
 * The board is portrait (taller than wide) so phones keep free margin beside it
 * to drag through — a horizontal putt near a side wall needs somewhere for the
 * finger to go. Holes run bottom (tee, larger y) to top (cup, smaller y).
 * Velocities are per second, in the same width-relative units.
 */

import { rngFromSeed } from './seed'

export interface Vec {
  x: number
  y: number
}

export interface BallState {
  p: Vec
  v: Vec
  /** Airborne time remaining (ms). While > 0 the ball flies: no friction, no
   *  walls, no capture, no hazards — set by hitting a jump ramp at speed. */
  air?: number
}

/** An axis-aligned wall rectangle the ball bounces off (fractions of the area). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A circular ground hazard. WATER swallows the ball (back to the tee, the
 *  swing already spent); SAND just drags hard — momentum goes to die there. */
export interface Hazard {
  p: Vec
  r: number
  kind: 'water' | 'sand'
}

/** A jump plate: cross it faster than RAMP_MIN_SPEED and the ball launches —
 *  along the RAMP's facing (`dir`, a unit vector, drawn as its chevrons), not
 *  along whatever line you rolled in on. Reading the kicker is the skill. */
export interface Ramp {
  rect: Rect
  dir: Vec
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
  /** Regions where the green simply ends — the ball falls off (back to tee). */
  voids: Rect[]
  ramps: Ramp[]
  /** SHAPE cuts: solid regions outside the course outline, fenced by rails the
   *  ball banks off — corner bites and side notches turn the square into Ls,
   *  doglegs and waists. Unlike voids these are safe: you bounce, not fall. */
  cuts: Rect[]
  par: number
  seed: string
  winnable: boolean
}

/** Board aspect: 1 wide × WORLD_H tall. Portrait uses phones' spare vertical
 *  space and leaves horizontal margin beside the board for pull-back drags. */
export const WORLD_H = 1.5
// Sized for the portrait board: it's narrower than the old square on phones,
// so the ball carries a slightly larger width-fraction to keep its on-screen
// size comfortable (~a pixel more than the square-board 0.022).
export const BALL_RADIUS = 0.0255
// Friction sets the maximum roll: exponential drag loses speed linearly with
// DISTANCE (dv/dx = -FRICTION), so a full-power putt travels MAX_POWER/FRICTION
// = 1.0 board-lengths. Bank routes on later holes are longer than that — they
// must be played as a lag putt plus a holing putt, which is where the pars
// come from. Holing range (arrive under CAPTURE_SPEED from full power) is
// (MAX_POWER - CAPTURE_SPEED) / FRICTION = 0.5.
export const FRICTION = 1.6
export const STOP_SPEED = 0.02 // below this the ball is considered at rest
export const MAX_POWER = 1.6 // max launch speed from a full-strength stroke
export const CAPTURE_SPEED = 0.9 // a GRAZING ball must be slower than this to drop
/** Within this fraction of the cup radius the ball is over the hole itself —
 *  there is nothing under it, so it drops at ANY speed. Only edge grazes can
 *  stay out by being hot. */
export const CUP_CORE = 0.6
export const CANCEL_POWER = 0.06 // drags weaker than this cancel (no stroke)
export const COURSE_HOLES = 9

// The cup interacts only at touching range: the drawn black circle IS the
// capture zone (dist < cupRadius, i.e. ball center over the black), the rim
// scrubs speed within RIM_REACH cup-radii, and a slow ball that is already
// touching the black gets a small pull so it drops instead of lipping. No
// long-range suction.
export const RIM_REACH = 1.5 // rim drag zone, in cup radii
export const RIM_DRAG = 2.4 // extra exponential drag per second over the rim
export const RIM_PULL = 0.4 // pull acceleration once over the black and slow
export const PULL_REACH = 1.25 // pull zone, in cup radii (≈ ball touching the black)

export const SAND_DRAG = 4.5 // extra exponential drag per second in sand

export const RAMP_MIN_SPEED = 0.35 // slower than this just rolls over the plate
export const RAMP_AIR_PER_SPEED = 380 // ms of flight per unit of speed
export const RAMP_AIR_MAX = 620 // flight time cap (ms)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
// Axis-specific board clamps: the two axes have different bounds, so the axis
// is in the name — reaching for the wrong one shouldn't be writable.
const clampX = (v: number, r: number) => clamp(v, r, 1 - r)
const clampY = (v: number, r: number) => clamp(v, r, WORLD_H - r)
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

const pointInRect = (p: Vec, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

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
  } else if (py > WORLD_H - r) {
    py = WORLD_H - r
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
  px = clampX(px, r)
  py = clampY(py, r)

  return { p: { x: px, y: py }, v: { x: vx, y: vy }, air: state.air }
}

/**
 * Advance the ball one fixed step.
 *
 * Airborne (air > 0): pure linear flight — no friction, no walls, no cup, and
 * the hazard/void checks in the driver don't apply until it lands.
 *
 * Grounded: integrate, apply friction (much more in sand, plus the cup's rim
 * drag/pull at touching range when a hole is provided), collide, and launch
 * off any jump ramp crossed at speed.
 */
export function step(state: BallState, walls: Rect[], dtMs: number, hole?: Hole): BallState {
  const dt = dtMs / 1000

  const air = state.air ?? 0
  if (air > 0) {
    return {
      p: { x: state.p.x + state.v.x * dt, y: state.p.y + state.v.y * dt },
      v: { x: state.v.x, y: state.v.y },
      air: Math.max(0, air - dtMs),
    }
  }

  const before = state.p
  const moved: BallState = {
    p: { x: state.p.x + state.v.x * dt, y: state.p.y + state.v.y * dt },
    v: { x: state.v.x, y: state.v.y },
    air: 0,
  }

  // Exponential friction — heavier in sand.
  let decay = Math.exp(-FRICTION * dt)
  if (hole && inSand(moved, hole)) decay *= Math.exp(-SAND_DRAG * dt)
  if (hole) {
    const d = dist(moved.p, hole.cup)
    if (d < hole.cupRadius * RIM_REACH) {
      // Rolling over the cup's rim scrubs speed off...
      decay *= Math.exp(-RIM_DRAG * dt)
      // ...and once the ball is over/touching the black and slow, a small pull
      // drops it in instead of letting it lip out. Touching range only.
      if (d < hole.cupRadius * PULL_REACH && speed(moved.v) < CAPTURE_SPEED && d > 1e-6) {
        const pull = (RIM_PULL * dt) / d
        moved.v.x += (hole.cup.x - moved.p.x) * pull
        moved.v.y += (hole.cup.y - moved.p.y) * pull
      }
    }
  }
  moved.v.x *= decay
  moved.v.y *= decay

  const out = collide(moved, walls)

  // Jump ramps: entering a plate at speed launches the ball along the RAMP's
  // facing — entry speed only sets how far it flies. Rolling in at an angle
  // still kicks you where the chevrons point.
  if (hole) {
    const spd = speed(out.v)
    if (spd >= RAMP_MIN_SPEED) {
      for (const ramp of hole.ramps) {
        if (!pointInRect(before, ramp.rect) && pointInRect(out.p, ramp.rect)) {
          out.air = Math.min(RAMP_AIR_MAX, RAMP_AIR_PER_SPEED * spd)
          out.v = { x: ramp.dir.x * spd, y: ramp.dir.y * spd }
          break
        }
      }
    }
  }

  return out
}

export const speed = (v: Vec): number => Math.hypot(v.x, v.y)
export const airborne = (state: BallState): boolean => (state.air ?? 0) > 0
export const atRest = (state: BallState): boolean => !airborne(state) && speed(state.v) < STOP_SPEED

/** Whether the ball drops: over the hole's CORE it falls at any speed (there
 *  is nothing under it — a fast ball can't skate across open air), while an
 *  edge graze needs to be slow or it lips out. A flying ball sails over. */
export function inCup(state: BallState, hole: Hole): boolean {
  if (airborne(state)) return false
  const d = dist(state.p, hole.cup)
  if (d >= hole.cupRadius) return false
  return d < hole.cupRadius * CUP_CORE || speed(state.v) < CAPTURE_SPEED
}

const inHazardKind = (state: BallState, hole: Hole, kind: Hazard['kind']): boolean =>
  !airborne(state) && hole.hazards.some((h) => h.kind === kind && dist(state.p, h.p) < h.r)

/** Whether the ball's centre has rolled into water (splash → back to the tee). */
export const inWater = (state: BallState, hole: Hole): boolean => inHazardKind(state, hole, 'water')

/** Whether the ball is currently dragging through a sand patch. */
export const inSand = (state: BallState, hole: Hole): boolean => inHazardKind(state, hole, 'sand')

/** Whether the ball has rolled off the green into a void (fall → back to tee). */
export function inVoid(state: BallState, hole: Hole): boolean {
  if (airborne(state)) return false
  return hole.voids.some((v) => pointInRect(state.p, v))
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

/** All solid rectangles in effect at time `tMs`: the course outline's shape
 *  cuts, static walls, and live movers. */
export function effectiveWalls(hole: Hole, tMs: number): Rect[] {
  return [...hole.cuts, ...hole.walls, ...hole.movers.map((m) => moverRectAt(m, tMs))]
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
  circles: Array<{ p: Vec; r: number }>
}

/** The obstacle set a putt must avoid: static walls, the full sweep of every
 *  moving wall, every WATER pool, every void (you can't roll across a
 *  drop-off) — and every jump RAMP. A ramp doesn't block the ball physically,
 *  but any planned leg is putted at speed, and a fast ball crossing a kicker
 *  gets hijacked along the ramp's facing — a guaranteed route that crosses one
 *  is a lottery, not a guarantee. Sand only slows, so it doesn't block a
 *  route. Using mover ENVELOPES keeps a found path valid no matter the wall's
 *  phase, so the hole stays winnable at all times. */
function holeObstacles(hole: Hole): Obstacles {
  return {
    rects: [
      ...hole.cuts,
      ...hole.walls,
      ...hole.movers.map(moverEnvelope),
      ...hole.voids,
      ...hole.ramps.map((r) => r.rect),
    ],
    circles: hole.hazards.filter((h) => h.kind === 'water'),
  }
}

/** Is the straight path a→b clear of every obstacle? Planning uses a wider
 *  margin than the bare ball radius so guaranteed routes keep human-playable
 *  clearance from water and rails — a waypoint should never sit one
 *  ball-width from a splash. */
const PLAN_MARGIN = BALL_RADIUS * 1.8
function clearPath(a: Vec, b: Vec, obs: Obstacles): boolean {
  for (const r of obs.rects) if (segHitsRect(a, b, r, PLAN_MARGIN)) return false
  for (const c of obs.circles) if (segHitsCircle(a, b, c.p, c.r + PLAN_MARGIN)) return false
  return true
}

/** Where a start→cup shot would bank off the reflecting line `at` on `axis`. */
export function bankPoint(start: Vec, cup: Vec, axis: 'x' | 'y', at: number): Vec | null {
  const r = BALL_RADIUS
  if (axis === 'x') {
    const mirroredX = 2 * at - cup.x
    const denom = mirroredX - start.x
    if (Math.abs(denom) < 1e-6) return null
    const t = (at - start.x) / denom
    if (t <= 0 || t >= 1) return null
    const y = start.y + t * (cup.y - start.y)
    if (y < r || y > WORLD_H - r) return null
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

export const RAILS: Array<['x' | 'y', number]> = [
  ['x', BALL_RADIUS],
  ['x', 1 - BALL_RADIUS],
  ['y', BALL_RADIUS],
  ['y', WORLD_H - BALL_RADIUS],
]

/** A rail can't be banked off where the green has fallen away into a void. */
function bankPointUsable(b: Vec, hole: Hole): boolean {
  const margin = BALL_RADIUS * 2
  return !hole.voids.some(
    (v) =>
      b.x >= v.x - margin &&
      b.x <= v.x + v.w + margin &&
      b.y >= v.y - margin &&
      b.y <= v.y + v.h + margin,
  )
}

export interface Solution {
  pathType: PathType
  strokes: number // idealised strokes to sink from the tee (1 = ace line)
}

/**
 * Find a guaranteed-clear route from tee to cup: a direct line, else a single
 * bank off any of the four rails (never off a rail that has fallen into a
 * void). Returns null when the hole cannot be solved this way — the generator
 * then regenerates or clears the layout.
 */
export function solveHole(hole: Hole): Solution | null {
  const obs = holeObstacles(hole)
  if (clearPath(hole.start, hole.cup, obs)) return { pathType: 'direct', strokes: 1 }
  for (const [axis, at] of RAILS) {
    const b = bankPoint(hole.start, hole.cup, axis, at)
    if (b && bankPointUsable(b, hole) && clearPath(hole.start, b, obs) && clearPath(b, hole.cup, obs)) {
      return { pathType: 'bank', strokes: 2 }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Waypoint routing: grid pathfinding through free space. One-bank mirror
// geometry can't validate a serpentine or a donut — so winnability, par and
// the spec's playtest bot all run on this instead: a coarse occupancy grid,
// BFS from ball to cup, then string-pulling down to the few straight legs a
// player would actually putt.
// ---------------------------------------------------------------------------

const NAV_N = 30 // columns; rows scale with the board's aspect
const NAV_M = Math.round(NAV_N * WORLD_H)

/** Straight putting legs from `from` to the cup through free space (the cup is
 *  the last entry), or null when no route exists at all. */
export function routeWaypoints(from: Vec, hole: Hole): Vec[] | null {
  const obs = holeObstacles(hole)
  const blockedAt = (x: number, y: number): boolean => {
    if (x < BALL_RADIUS || x > 1 - BALL_RADIUS || y < BALL_RADIUS || y > WORLD_H - BALL_RADIUS) return true
    for (const r of obs.rects) {
      if (
        x > r.x - PLAN_MARGIN &&
        x < r.x + r.w + PLAN_MARGIN &&
        y > r.y - PLAN_MARGIN &&
        y < r.y + r.h + PLAN_MARGIN
      )
        return true
    }
    for (const c of obs.circles) {
      if (Math.hypot(x - c.p.x, y - c.p.y) < c.r + PLAN_MARGIN) return true
    }
    return false
  }

  const cx = (i: number) => i / (NAV_N - 1)
  const cy = (j: number) => (j / (NAV_M - 1)) * WORLD_H
  const blocked = new Uint8Array(NAV_N * NAV_M)
  for (let j = 0; j < NAV_M; j += 1) {
    for (let i = 0; i < NAV_N; i += 1) blocked[j * NAV_N + i] = blockedAt(cx(i), cy(j)) ? 1 : 0
  }

  // Snap an arbitrary point to the nearest free cell (spiralling outward).
  const cellFor = (p: Vec): number => {
    const i0 = Math.round(p.x * (NAV_N - 1))
    const j0 = Math.round((p.y / WORLD_H) * (NAV_M - 1))
    for (let ring = 0; ring < Math.max(NAV_N, NAV_M); ring += 1) {
      for (let dj = -ring; dj <= ring; dj += 1) {
        for (let di = -ring; di <= ring; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue
          const i = i0 + di
          const j = j0 + dj
          if (i < 0 || i >= NAV_N || j < 0 || j >= NAV_M) continue
          if (!blocked[j * NAV_N + i]) return j * NAV_N + i
        }
      }
    }
    return -1
  }

  const startCell = cellFor(from)
  const goalCell = cellFor(hole.cup)
  if (startCell < 0 || goalCell < 0) return null

  // 4-connected BFS (no diagonal corner-squeezes).
  const prev = new Int32Array(NAV_N * NAV_M).fill(-1)
  prev[startCell] = startCell
  const queue = [startCell]
  let found = startCell === goalCell
  for (let qi = 0; qi < queue.length && !found; qi += 1) {
    const cur = queue[qi]
    const ci = cur % NAV_N
    const cj = (cur - ci) / NAV_N
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = ci + di
      const nj = cj + dj
      if (ni < 0 || ni >= NAV_N || nj < 0 || nj >= NAV_M) continue
      const n = nj * NAV_N + ni
      if (blocked[n] || prev[n] >= 0) continue
      prev[n] = cur
      if (n === goalCell) {
        found = true
        break
      }
      queue.push(n)
    }
  }
  if (!found) return null

  // Cell path goal→start, then re-ordered start→goal as points.
  const pts: Vec[] = [{ ...hole.cup }]
  for (let c = goalCell; c !== startCell; c = prev[c]) {
    pts.push({ x: cx(c % NAV_N), y: cy(Math.floor(c / NAV_N)) })
  }
  pts.push({ ...from })
  pts.reverse()
  pts[pts.length - 1] = { ...hole.cup } // end exactly at the cup

  // String-pull: from each point, jump to the furthest point still in clear
  // line of sight, leaving only the real putting legs.
  const out: Vec[] = []
  let at = 0
  while (at < pts.length - 1) {
    let far = at + 1
    for (let j = pts.length - 1; j > at; j -= 1) {
      if (clearPath(pts[at], pts[j], obs)) {
        far = j
        break
      }
    }
    out.push(pts[far])
    at = far
  }
  return out
}

export const isWinnable = (hole: Hole): boolean => routeWaypoints(hole.start, hole) !== null

/**
 * The next aim point from an arbitrary ball position: the cup when the direct
 * line is clear, else a usable one-bank rail point with both legs clear, else
 * null (boxed in — just play at the cup and improvise). Powers the playability
 * simulation in the spec, and matches exactly what solveHole guarantees from
 * the tee.
 */
export function routeTarget(p: Vec, hole: Hole): Vec | null {
  const obs = holeObstacles(hole)
  if (clearPath(p, hole.cup, obs)) return { ...hole.cup }
  for (const [axis, at] of RAILS) {
    const b = bankPoint(p, hole.cup, axis, at)
    if (b && bankPointUsable(b, hole) && clearPath(p, b, obs) && clearPath(b, hole.cup, obs)) {
      return b
    }
  }
  return null
}

/**
 * Par from the hole's real difficulty. The waypoint route's length says how
 * many strokes perfect play needs (a full-power putt rolls 1.0 and the last
 * ~0.5 must arrive at holing pace); a blocked straight line adds one stroke of
 * human slack, and kitchen-sink holes (4+ hazards/movers/voids) one more.
 * Bounded 2..6.
 */
export function derivePar(hole: Hole, sol: Solution | null): number {
  const wps = routeWaypoints(hole.start, hole) ?? [{ ...hole.cup }]
  let len = 0
  let prev = hole.start
  for (const w of wps) {
    len += dist(prev, w)
    prev = w
  }
  const minStrokes = 1 + Math.ceil(Math.max(0, len - 0.5))
  let par = minStrokes + (sol?.pathType === 'direct' ? 0 : 1)
  const features = hole.hazards.length + hole.movers.length + hole.voids.length
  if (features >= 4) par += 1
  return clamp(par, 2, 6)
}

// ---------------------------------------------------------------------------
// Hole generation (progressive difficulty + solvability guarantee)
// ---------------------------------------------------------------------------

const rectsOverlap = (a: Rect, b: Rect, pad = 0.02): boolean =>
  a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad

/**
 * `sparse` progressively thins a layout when a fully-loaded one refuses to
 * leave a bank route open: 1 drops the decoration walls, 2 also drops the
 * second mover/void/water/sand. Used by makeHole's retry ladder so the busiest
 * holes stay bank-only instead of degrading to a free straight shot.
 */
/** A piece of the course OUTLINE: `rail` pieces are solid (timber-fenced, the
 *  ball banks off them), `chasm` pieces are missing green (roll in and fall). */
interface ShapePiece {
  rect: Rect
  kind: 'rail' | 'chasm'
}

/** The silhouette repertoire. Every course deals ONE of each across its
 *  shaped holes (see templateFor), so a full round always shows the whole
 *  menagerie. */
export const SHAPE_TEMPLATES = ['L', 'donut', 'serpent', 'eight', 'W', 'amoeba', 'pinch'] as const
export type ShapeTemplate = (typeof SHAPE_TEMPLATES)[number] | 'full'

/**
 * Which silhouette a hole gets: the first two holes are plain, then the seven
 * templates are dealt as a seed-shuffled deck over holes 3–9 — no repeats, no
 * course without an 8 or a W or an amoeba.
 */
export function templateFor(seed: string, index: number): ShapeTemplate {
  if (index < 2) return 'full'
  const rng = rngFromSeed(`golf-shapes:${seed}`)
  const deck = [...SHAPE_TEMPLATES]
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck[(index - 2) % deck.length]
}

/**
 * Build a template's pieces. These are DEEP: quarter-board Ls, fat islands,
 * slabs reaching two-thirds of the way across. Each piece independently rolls
 * railed (timber, bank off it) or chasm (torn edge, fall in).
 *
 * NOTE: rects here are authored in the UNIT square (y and h in [0,1], "1" =
 * full board height) — the caller stretches them onto the portrait board by
 * WORLD_H. New templates must NOT use world-space y values.
 */
function shapePieces(template: ShapeTemplate, t: number, rng: () => number): ShapePiece[] {
  const kindRoll = (): ShapePiece['kind'] => (rng() < 0.3 + 0.2 * t ? 'chasm' : 'rail')
  switch (template) {
    case 'L': {
      // A giant corner block — a quarter of the board or more, gone.
      const left = rng() < 0.5
      const top = rng() < 0.5
      const w = 0.45 + rng() * 0.15
      const h = 0.38 + rng() * 0.12
      return [{ rect: { x: left ? 0 : 1 - w, y: top ? 0 : 1 - h, w, h }, kind: kindRoll() }]
    }
    case 'donut': {
      // A fat central island: play around either side (the O).
      const w = 0.3 + rng() * 0.12
      const h = 0.26 + rng() * 0.1
      return [
        {
          rect: { x: 0.5 - w / 2 + (rng() - 0.5) * 0.1, y: 0.46 - h / 2 + (rng() - 0.5) * 0.1, w, h },
          kind: kindRoll(),
        },
      ]
    }
    case 'eight': {
      // Two stacked islands: weave between them (the 8).
      const w1 = 0.24 + rng() * 0.08
      const w2 = 0.24 + rng() * 0.08
      return [
        { rect: { x: 0.5 - w1 / 2 + (rng() - 0.5) * 0.12, y: 0.24, w: w1, h: 0.15 }, kind: kindRoll() },
        { rect: { x: 0.5 - w2 / 2 + (rng() - 0.5) * 0.12, y: 0.55, w: w2, h: 0.15 }, kind: kindRoll() },
      ]
    }
    case 'serpent': {
      // Two opposing slabs reaching well past the middle: a true S-corridor.
      const th = 0.15 + rng() * 0.04
      const reach = 0.62 + rng() * 0.08
      const leftFirst = rng() < 0.5
      const y1 = 0.26 + rng() * 0.04
      const y2 = y1 + th + 0.15 + rng() * 0.04
      return [
        { rect: { x: leftFirst ? 0 : 1 - reach, y: y1, w: reach, h: th }, kind: kindRoll() },
        { rect: { x: leftFirst ? 1 - reach : 0, y: y2, w: reach, h: th }, kind: kindRoll() },
      ]
    }
    case 'W': {
      // Three alternating slabs: a full zigzag, top to bottom.
      const th = 0.11 + rng() * 0.02
      const reach = 0.56 + rng() * 0.08
      const leftFirst = rng() < 0.5
      const gap = 0.12 + rng() * 0.02
      const y1 = 0.16 + rng() * 0.03
      const y2 = y1 + th + gap
      const y3 = y2 + th + gap
      return [
        { rect: { x: leftFirst ? 0 : 1 - reach, y: y1, w: reach, h: th }, kind: kindRoll() },
        { rect: { x: leftFirst ? 1 - reach : 0, y: y2, w: reach, h: th }, kind: kindRoll() },
        { rect: { x: leftFirst ? 0 : 1 - reach, y: y3, w: reach, h: th }, kind: kindRoll() },
      ]
    }
    case 'pinch': {
      // An hourglass: two slabs squeeze in from both sides, leaving one gate.
      const th = 0.14 + rng() * 0.04
      const y = 0.36 + rng() * 0.16
      const gateX = 0.3 + rng() * 0.4
      const gate = 0.18 + rng() * 0.08
      const leftW = Math.max(0.12, gateX - gate / 2)
      const rightX = Math.min(0.88, gateX + gate / 2)
      return [
        { rect: { x: 0, y, w: leftW, h: th }, kind: kindRoll() },
        { rect: { x: rightX, y, w: 1 - rightX, h: th }, kind: kindRoll() },
      ]
    }
    case 'amoeba': {
      // An irregular organism: a big corner blob, a deep side pseudopod, an island.
      const pieces: ShapePiece[] = []
      const cLeft = rng() < 0.5
      const cTop = rng() < 0.5
      const cw = 0.34 + rng() * 0.14
      const ch = 0.28 + rng() * 0.1
      pieces.push({ rect: { x: cLeft ? 0 : 1 - cw, y: cTop ? 0 : 1 - ch, w: cw, h: ch }, kind: kindRoll() })
      const nw = 0.18 + rng() * 0.12
      const nh = 0.3 + rng() * 0.16
      const notch: Rect = { x: cLeft ? 1 - nw : 0, y: 0.28 + rng() * 0.25, w: nw, h: nh }
      if (!pieces.some((p) => rectsOverlap(notch, p.rect, 0.12))) pieces.push({ rect: notch, kind: kindRoll() })
      const iw = 0.16 + rng() * 0.08
      const island: Rect = { x: 0.36 + rng() * 0.2, y: 0.32 + rng() * 0.2, w: iw, h: iw * (0.8 + rng() * 0.4) }
      if (!pieces.some((p) => rectsOverlap(island, p.rect, 0.12))) pieces.push({ rect: island, kind: kindRoll() })
      return pieces
    }
    default:
      return []
  }
}

function buildCandidate(
  index: number,
  seed: string,
  salt: number,
  sparse = 0,
  template: ShapeTemplate = 'full',
): Hole | null {
  const rng = rngFromSeed(`golf:${seed}:${index}:${salt}:${sparse}`)
  const t = index / (COURSE_HOLES - 1) // 0 (first) .. 1 (last): difficulty ramp

  // --- Course silhouette first: everything else fits around it. ---------------
  // The template survives the whole sparse ladder except the very last rung —
  // a course should shed clutter, not its shape. Templates are authored in the
  // unit square and stretched onto the portrait board.
  const pieces = (sparse >= 3 ? [] : shapePieces(template, t, rng)).map((p) => ({
    kind: p.kind,
    rect: { x: p.rect.x, y: p.rect.y * WORLD_H, w: p.rect.w, h: p.rect.h * WORLD_H },
  }))
  const shapeCuts = pieces.filter((p) => p.kind === 'rail').map((p) => p.rect)
  const shapeVoids = pieces.filter((p) => p.kind === 'chasm').map((p) => p.rect)
  const shapeRects = pieces.map((p) => p.rect)

  // Tee and cup live in the silhouette's free space (sampled, with margin).
  const startY = (0.8 + t * 0.1) * WORLD_H
  const cupY = (0.28 - t * 0.16) * WORLD_H
  const clearOfShape = (p: Vec, margin: number): boolean =>
    !shapeRects.some((r) =>
      pointInRect(p, { x: r.x - margin, y: r.y - margin, w: r.w + 2 * margin, h: r.h + 2 * margin }),
    )
  const samplePoint = (y: number, spread: number, edge: number): Vec | null => {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const p: Vec = { x: clampX(0.5 + (rng() - 0.5) * spread, edge), y }
      if (clearOfShape(p, 0.09)) return p
    }
    return null
  }
  const start = samplePoint(startY, 0.7, BALL_RADIUS * 2)
  const cup = samplePoint(cupY, 0.85, 0.07)
  if (!start || !cup) return null // silhouette left no room — next salt
  // The cup is barely bigger than the ball (BALL_RADIUS) and tightens
  // further over the course — sinking is an aimed act, not a splash zone.
  const cupRadius = 0.034 - 0.003 * t
  const span = start.y - cup.y

  // A point on the direct tee→cup line, offset sideways by `off` (perpendicular).
  const lanePoint = (u: number, off: number): Vec => {
    const lx = start.x + (cup.x - start.x) * u
    const ly = start.y + (cup.y - start.y) * u
    const dx = cup.x - start.x
    const dy = cup.y - start.y
    const len = Math.hypot(dx, dy) || 1
    return { x: lx + (-dy / len) * off, y: ly + (dx / len) * off }
  }

  const cuts: Rect[] = [...shapeCuts]

  // --- Walls -----------------------------------------------------------------
  // From hole 2 on, BLOCKER bars are laid across the direct tee→cup line so the
  // straight ace is gone and the hole plays off the rails. Decoration walls
  // never stack on anything already placed.
  const walls: Rect[] = []
  const allRects = (): Rect[] => walls
  const overlapsExisting = (r: Rect): boolean => allRects().some((w) => rectsOverlap(r, w))

  const blockerCount = index === 0 ? 0 : index >= 5 ? 2 : 1
  const blockerUs = blockerCount === 2 ? [0.32 + rng() * 0.1, 0.6 + rng() * 0.12] : [0.42 + rng() * 0.2]
  for (const u of blockerUs.slice(0, blockerCount)) {
    const mx = start.x + (cup.x - start.x) * u
    const my = start.y + (cup.y - start.y) * u
    // A pair of bars stays slimmer than a lone one — two wide bars (plus voids)
    // can seal every bank route and force the degenerate fallback.
    const w = (blockerCount === 2 ? 0.28 + rng() * 0.12 : 0.34 + rng() * 0.18) + t * 0.1
    const bx = clamp(mx - w / 2, 0.02, 0.98 - w)
    const cand: Rect = { x: bx, y: my - 0.0175, w, h: 0.035 }
    // The clamp near an edge can slide the bar off the line — recenter if so.
    if (!segHitsRect(start, cup, cand, BALL_RADIUS)) cand.x = clamp(mx - w / 2, 0, 1 - w)
    // A bar swallowed by the silhouette is dead weight — the shape already blocks.
    if (!overlapsExisting(cand) && !shapeRects.some((c) => rectsOverlap(cand, c, 0))) walls.push(cand)
  }

  // --- Moving walls -------------------------------------------------------------
  // Placed right after the blockers so they get first pick of the open bands.
  // Both variants sweep ACROSS the ball's corridor (along x): a long GATE bar
  // whose opening slides side to side, and a vertical WIPER blade. (A vertical
  // bar sliding along its own length never actually changed anything.)
  const movers: MovingWall[] = []
  const addMover = (): void => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const midY = cup.y + 0.16 + rng() * Math.max(0.1, span - 0.34)
      const horizontal = rng() < 0.65
      const base: Rect = horizontal
        ? { x: 0, y: midY, w: 0.16 + rng() * 0.08, h: 0.035 }
        : { x: 0, y: midY - (0.16 + rng() * 0.06) / 2, w: 0.035, h: 0.16 + rng() * 0.06 }
      const amp = 0.3 + rng() * 0.18
      base.x = clamp(0.06 + rng() * (1 - base.w - amp - 0.12), 0.03, 1 - base.w - amp - 0.03)
      const m: MovingWall = { base, axis: 'x', amp, speed: 0.9 + rng() * 1.1, phase: rng() * 6.28 }
      // The sweep must not stack on the blockers, the shape cuts, or another
      // mover's sweep.
      const env = moverEnvelope(m)
      if (
        !walls.some((w) => rectsOverlap(env, w)) &&
        !shapeRects.some((c) => rectsOverlap(env, c)) &&
        !movers.some((o) => rectsOverlap(env, moverEnvelope(o)))
      ) {
        movers.push(m)
        return
      }
    }
  }
  if (index >= 4) addMover()
  if (index >= 7 && sparse < 2 && rng() < 0.6) addMover()

  // --- Decoration walls (bank targets) — never stacked on anything ---------------
  const wallCount = sparse >= 1 ? 0 : Math.min(3, Math.round(t * 2) + Math.floor(rng() * 2))
  for (let i = 0; i < wallCount; i += 1) {
    const bandY = cup.y + 0.14 + ((i + 0.5) / Math.max(1, wallCount)) * (span - 0.28) + (rng() - 0.5) * 0.05
    let cand: Rect
    if (rng() < 0.55) {
      const w = 0.2 + rng() * (0.16 + t * 0.16)
      cand = { x: clampX(rng() * (1 - w), 0), y: bandY, w, h: 0.035 }
    } else {
      const h = 0.12 + rng() * (0.12 + t * 0.1)
      cand = { x: clamp(0.15 + rng() * 0.66, 0.05, 0.92), y: bandY - h / 2, w: 0.035, h }
    }
    if (
      !overlapsExisting(cand) &&
      !shapeRects.some((c) => rectsOverlap(cand, c)) &&
      !movers.some((m) => rectsOverlap(cand, moverEnvelope(m)))
    )
      walls.push(cand)
  }

  // --- Hazards (water + sand) -------------------------------------------------
  // Placed to threaten the actual putting lanes: near the direct line and the
  // bank routes, never stacked on each other, never crowding the tee or cup,
  // never under a wall or a moving wall's sweep.
  const hazards: Hazard[] = []
  const hazardFits = (p: Vec, r: number): boolean => {
    // The whole pool stays (essentially) on the board — no clipped half-moons.
    if (p.x < r * 0.9 || p.x > 1 - r * 0.9 || p.y < r * 0.9 || p.y > WORLD_H - r * 0.9) return false
    if (dist(p, start) < r + 0.12) return false
    if (dist(p, cup) < r + cupRadius + 0.09) return false
    if (hazards.some((h) => dist(p, h.p) < r + h.r + 0.04)) return false
    // Not centered under a wall (a blob lapping a timber edge reads fine) and
    // never under a sweeping wall's whole travel band.
    const grown = r * 0.4
    if (
      walls.some((w) =>
        pointInRect(p, { x: w.x - grown, y: w.y - grown, w: w.w + 2 * grown, h: w.h + 2 * grown }),
      )
    )
      return false
    // Fully on the course: clear of the silhouette (rails AND chasms).
    if (
      shapeRects.some((c) =>
        pointInRect(p, { x: c.x - r, y: c.y - r, w: c.w + 2 * r, h: c.h + 2 * r }),
      )
    )
      return false
    const bounds = { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }
    if (movers.some((m) => rectsOverlap(moverEnvelope(m), bounds, 0))) return false
    return true
  }
  const addHazard = (kind: Hazard['kind'], maxOff: number): void => {
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const r = kind === 'water' ? 0.055 + rng() * 0.03 : 0.07 + rng() * 0.04
      // Prefer spots near the putting lane; on tightly-shaped boards fall back
      // to anywhere free so the trap still lands somewhere that matters.
      const p =
        attempt < 14
          ? lanePoint(0.2 + rng() * 0.6, (rng() < 0.5 ? -1 : 1) * (kind === 'sand' ? rng() * maxOff : 0.08 + rng() * maxOff))
          : { x: 0.1 + rng() * 0.8, y: cup.y + 0.12 + rng() * Math.max(0.1, span - 0.2) }
      if (hazardFits(p, r)) {
        hazards.push({ p: { x: clampX(p.x, r * 0.9), y: clampY(p.y, r * 0.9) }, r, kind })
        return
      }
    }
  }
  if (index >= 2) addHazard('water', 0.22)
  if (index >= 4 && sparse < 2 && rng() < 0.7) addHazard('water', 0.26)
  // Sand grows steadily more likely each round, reaching ~90% on the finale.
  if (rng() < 0.15 + 0.75 * t) addHazard('sand', 0.2)
  if (index >= 6 && sparse < 2 && rng() < 0.5) addHazard('sand', 0.24)

  // --- Voids (the green just ends) ---------------------------------------------
  // The silhouette's chasm pieces are voids; plain boards may add small extras.
  const voids: Rect[] = [...shapeVoids]
  const voidOk = (v: Rect): boolean => {
    const grown = { x: v.x - 0.1, y: v.y - 0.1, w: v.w + 0.2, h: v.h + 0.2 }
    if (pointInRect(start, grown) || pointInRect(cup, grown)) return false
    if (cuts.some((c) => rectsOverlap(v, c, 0.06))) return false
    if (walls.some((w) => rectsOverlap(v, w))) return false
    if (movers.some((m) => rectsOverlap(v, moverEnvelope(m)))) return false
    if (hazards.some((h) => pointInRect(h.p, { x: v.x - h.r, y: v.y - h.r, w: v.w + 2 * h.r, h: v.h + 2 * h.r })))
      return false
    return true
  }
  const addVoid = (): void => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      let v: Rect
      if (rng() < 0.5) {
        // Corner bite: the green is missing a corner.
        const left = rng() < 0.5
        const top = rng() < 0.5
        const w = 0.22 + rng() * 0.14
        const h = 0.18 + rng() * 0.12
        v = { x: left ? 0 : 1 - w, y: top ? 0 : WORLD_H - h, w, h }
      } else {
        // Edge shelf: a strip of missing green along one side rail.
        const left = rng() < 0.5
        const w = 0.05 + rng() * 0.025
        const h = 0.26 + rng() * 0.18
        v = { x: left ? 0 : 1 - w, y: (0.2 + rng() * 0.42) * WORLD_H, w, h }
      }
      if (voidOk(v)) {
        voids.push(v)
        return
      }
    }
  }
  if (index >= 5 && pieces.length === 0) addVoid()
  if (index >= 7 && pieces.length === 0 && sparse < 2 && rng() < 0.6) addVoid()

  // --- Jump ramps -----------------------------------------------------------------
  // A kicker plate near (not on) the tee line, early in the shot. It launches
  // along its OWN facing — usually skewed well off the cup, sometimes lined up
  // for the dream ace. Reading where the chevrons actually point is the skill.
  const ramps: Ramp[] = []
  if (index >= 6) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const u = 0.14 + rng() * 0.16
      // Beside the tee line, never ON it: a kicker on the safe line would turn
      // the guaranteed route into a lottery (any firm putt gets hijacked).
      const off = (rng() < 0.5 ? -1 : 1) * (0.1 + rng() * 0.1)
      const p = lanePoint(u, off)
      const rect: Rect = { x: clamp(p.x - 0.05, 0.02, 0.88), y: clamp(p.y - 0.035, 0.02, WORLD_H - 0.09), w: 0.1, h: 0.07 }
      if (segHitsRect(start, cup, rect, BALL_RADIUS * 2)) continue
      const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
      // Facing: toward the cup, then rotated by a healthy random skew (±15°–49°,
      // with a rare ~1-in-6 true liner at only a few degrees off).
      const toCup = Math.atan2(cup.y - center.y, cup.x - center.x)
      const skew = rng() < 0.17 ? (rng() - 0.5) * 0.12 : (rng() < 0.5 ? -1 : 1) * (0.26 + rng() * 0.6)
      const ang = toCup + skew
      const dir: Vec = { x: Math.cos(ang), y: Math.sin(ang) }
      const clearOfEverything =
        !walls.some((w) => rectsOverlap(rect, w)) &&
        !cuts.some((c) => rectsOverlap(rect, c)) &&
        !movers.some((m) => rectsOverlap(rect, moverEnvelope(m))) &&
        !voids.some((v) => rectsOverlap(rect, v)) &&
        !hazards.some((h) => dist(center, h.p) < h.r + 0.09)
      if (clearOfEverything) {
        ramps.push({ rect, dir })
        break
      }
    }
  }

  return {
    index,
    start,
    cup,
    cupRadius,
    walls,
    hazards,
    movers,
    voids,
    ramps,
    cuts,
    par: 2,
    seed,
    winnable: false,
  }
}

/** Remove anything blocking the direct tee→cup line, guaranteeing a clear shot.
 *  The safety net when random layouts refuse to be solvable. */
function clearBlockers(hole: Hole): void {
  const line = (obs: Obstacles) => clearPath(hole.start, hole.cup, obs)
  hole.cuts = hole.cuts.filter((c) => line({ rects: [c], circles: [] }))
  hole.walls = hole.walls.filter((w) => line({ rects: [w], circles: [] }))
  hole.hazards = hole.hazards.filter(
    (c) => c.kind === 'sand' || line({ rects: [], circles: [{ p: c.p, r: c.r }] }),
  )
  hole.movers = hole.movers.filter((m) => line({ rects: [moverEnvelope(m)], circles: [] }))
  hole.voids = hole.voids.filter((v) => line({ rects: [v], circles: [] }))
}

/**
 * Generate a deterministic, always-winnable hole. Hole 1 may be a clean direct
 * line; every later hole REQUIRES a layout whose only guaranteed route is a
 * bank — the straight ace is generated away. Layouts are retried with new salts
 * until one qualifies; as a last resort blocking obstacles are cleared so a
 * direct shot always exists. Par is then derived from the actual route.
 */
export function makeHole(index: number, seed: string): Hole {
  let fallback: { hole: Hole; sol: Solution | null } | null = null
  // Retry ladder: full layouts first, then progressively sparser ones — a busy
  // finale hole should shed its clutter before it ever concedes a straight ace.
  // A hole is playable when the waypoint router finds ANY multi-leg route; from
  // hole 2 on we additionally demand the straight tee→cup ace be blocked.
  const template = templateFor(seed, index)
  for (let sparse = 0; sparse <= 3; sparse += 1) {
    for (let salt = 0; salt < 64; salt += 1) {
      const hole = buildCandidate(index, seed, salt, sparse, template)
      if (!hole) continue // silhouette left no room for tee/cup
      if (!routeWaypoints(hole.start, hole)) continue // not connected
      const sol = solveHole(hole)
      if (index === 0 || sol?.pathType !== 'direct') {
        hole.par = derivePar(hole, sol)
        hole.winnable = true
        return hole
      }
      if (!fallback) fallback = { hole, sol }
    }
  }
  if (fallback) {
    fallback.hole.par = derivePar(fallback.hole, fallback.sol)
    fallback.hole.winnable = true
    return fallback.hole
  }
  // Last resort (no candidate was playable at all): peel obstacles off one
  // layer at a time until a route opens, so even a degenerate seed keeps most
  // of its hole — never a naked green with a free straight shot.
  const hole = buildCandidate(index, seed, 0, 0, template) ?? buildCandidate(index, seed, 0, 3)!
  const peels: Array<() => void> = [
    () => (hole.voids = hole.voids.slice(0, 1)),
    () => (hole.voids = []),
    () => (hole.movers = hole.movers.slice(0, 1)),
    () => (hole.movers = []),
    () => (hole.cuts = hole.cuts.slice(0, 1)),
    () => (hole.cuts = []),
    () => (hole.walls = hole.walls.slice(0, Math.max(1, hole.walls.length - 1))),
    () => (hole.walls = hole.walls.slice(0, 1)),
  ]
  let ok = isWinnable(hole)
  for (const peel of peels) {
    if (ok) break
    peel()
    ok = isWinnable(hole)
  }
  if (!ok) clearBlockers(hole)
  hole.par = derivePar(hole, solveHole(hole))
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
