/**
 * Mini Golf — physics and course generation, pure and testable. The view drives
 * a fixed-timestep simulation and renders; this module owns the ball integrator,
 * wall reflection, hole capture, and seeded hole layouts.
 *
 * Coordinates are fractions of the play area: x,y in [0,1]. The course is taller
 * than wide (portrait). Velocities are per second.
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

export interface Hole {
  index: number
  start: Vec
  cup: Vec
  cupRadius: number
  walls: Rect[]
  par: number
  seed: string
}

export const BALL_RADIUS = 0.022
export const FRICTION = 1.2 // velocity halving-ish drag per second (see step)
export const STOP_SPEED = 0.02 // below this the ball is considered at rest
export const MAX_POWER = 1.6 // max launch speed from a full-strength stroke
export const CAPTURE_SPEED = 0.9 // ball must be slower than this to drop in the cup

const clamp01 = (v: number, r: number) => Math.max(r, Math.min(1 - r, v))

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

/** Advance the ball one fixed step: integrate, apply friction, then collide. */
export function step(state: BallState, walls: Rect[], dtMs: number): BallState {
  const dt = dtMs / 1000
  const moved: BallState = {
    p: { x: state.p.x + state.v.x * dt, y: state.p.y + state.v.y * dt },
    v: { x: state.v.x, y: state.v.y },
  }
  // Exponential friction.
  const decay = Math.exp(-FRICTION * dt)
  moved.v.x *= decay
  moved.v.y *= decay
  return collide(moved, walls)
}

export const speed = (v: Vec): number => Math.hypot(v.x, v.y)
export const atRest = (state: BallState): boolean => speed(state.v) < STOP_SPEED

/** Whether the ball is over the cup and slow enough to be captured. */
export function inCup(state: BallState, hole: Hole): boolean {
  const dx = state.p.x - hole.cup.x
  const dy = state.p.y - hole.cup.y
  return Math.hypot(dx, dy) < hole.cupRadius && speed(state.v) < CAPTURE_SPEED
}

/**
 * Build a launch velocity from an aim vector (drag from the ball). `power` is
 * 0..1 of MAX_POWER; the ball fires opposite the drag (pull-back-to-shoot).
 */
export function aimToVelocity(drag: Vec, power: number): Vec {
  const len = Math.hypot(drag.x, drag.y) || 1
  const p = Math.max(0, Math.min(1, power)) * MAX_POWER
  return { x: (-drag.x / len) * p, y: (-drag.y / len) * p }
}

/** Generate a deterministic hole: start near the bottom, cup near the top, with
 *  a couple of wall obstacles in between. */
export function makeHole(index: number, seed: string): Hole {
  const rng = rngFromSeed(`golf:${seed}:${index}`)
  const start: Vec = { x: clamp01(0.3 + rng() * 0.4, BALL_RADIUS), y: 0.86 }
  const cup: Vec = { x: clamp01(0.25 + rng() * 0.5, 0.05), y: 0.12 }

  const wallCount = 1 + Math.min(3, Math.floor(index / 2) + Math.floor(rng() * 2))
  const walls: Rect[] = []
  for (let i = 0; i < wallCount; i += 1) {
    const horizontal = rng() < 0.6
    const band = 0.28 + (i / Math.max(1, wallCount)) * 0.42 + rng() * 0.06 // y position, mid-course
    if (horizontal) {
      const w = 0.3 + rng() * 0.4
      walls.push({ x: clamp01(rng() * (1 - w), 0) , y: band, w, h: 0.035 })
    } else {
      const h = 0.16 + rng() * 0.2
      walls.push({ x: 0.2 + rng() * 0.6, y: band - h / 2, w: 0.035, h })
    }
  }

  const par = 2 + Math.floor(index / 3) + (wallCount >= 3 ? 1 : 0)
  return { index, start, cup, cupRadius: 0.05, walls, par, seed }
}

export const COURSE_HOLES = 9
