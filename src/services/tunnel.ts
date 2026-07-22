/**
 * Vertical tunnel flapper — physics and course generation, kept pure so the
 * game loop in the view stays a thin driver and the tricky bits are testable.
 *
 * The tunnel scrolls downward past a fixed-height flyer, so "distance" (score)
 * grows as the course advances. Every length is a fraction of the play WIDTH,
 * so the model is resolution-independent; the view multiplies by its pixels.
 */

import { mulberry32 } from './seed'

export interface FlyerState {
  x: number // center, 0..1
  vx: number // horizontal velocity, fraction of width per second
}

/** A horizontal slice of the tunnel: passable gap between left and right walls. */
export interface Segment {
  left: number
  right: number
}

// Per-tap horizontal impulse. Kept small relative to the tunnel width so a tap
// nudges the flyer (total coast ≈ FLAP_VX / decay ≈ 0.11 of width) instead of
// lurching it across the gap — threading pinch points stays controllable.
export const FLAP_VX = 0.38 // horizontal speed imparted by a flap
export const FLYER_RADIUS = 0.038 // as a fraction of width (small = more slack)

/**
 * Advance the flyer horizontally. Velocity decays exponentially so taps feel
 * snappy but drift settles. dtMs is the frame time in milliseconds.
 */
export function stepFlyer(state: FlyerState, dtMs: number): FlyerState {
  const dt = dtMs / 1000
  const vx = state.vx * Math.exp(-3 * dt)
  const x = state.x + vx * dt
  // Clamp to the play area; hitting the outer bound kills horizontal momentum.
  if (x < FLYER_RADIUS) return { x: FLYER_RADIUS, vx: 0 }
  if (x > 1 - FLYER_RADIUS) return { x: 1 - FLYER_RADIUS, vx: 0 }
  return { x, vx }
}

/** Apply a flap toward -1 (left) or +1 (right). */
export function flap(state: FlyerState, dir: -1 | 1): FlyerState {
  return { ...state, vx: dir * FLAP_VX }
}

/** True if the flyer at center x overlaps either wall of a segment. */
export function collides(x: number, seg: Segment): boolean {
  return x - FLYER_RADIUS < seg.left || x + FLYER_RADIUS > seg.right
}

/** Smallest half-gap the course will ever produce, so a passage always fits. */
export const MIN_HALF_GAP = 0.1

/**
 * Generate the tunnel as a deterministic function of a seed and a row index, so
 * the course is reproducible and endless. The corridor does three things that
 * make the run less monotonous, all scaling with `difficulty` (0..1):
 *   - the centerline weaves (a wide slow wave plus a faster seed-shifted wobble),
 *   - it "breathes" between roomy stretches and tighter pinch points, and
 *   - the whole gap narrows.
 * It always leaves a passable, in-bounds gap wider than the circle.
 */
export function segmentAt(seed: number, row: number, difficulty = 0): Segment {
  const rand = mulberry32((seed + row * 2654435761) >>> 0)
  const t = row * 0.15
  // Weaving centerline: bends more, and wobbles faster, the deeper you go.
  const sway = 0.24 + 0.06 * difficulty
  const wobble = (0.08 + 0.05 * difficulty) * Math.sin(t * 2.3 + seed)
  const center = 0.5 + sway * Math.sin(t) + wobble
  // Breathing width: a slow wave pinches the tunnel in and lets it back out,
  // with deeper pinches as difficulty rises, on top of the overall narrowing.
  const breathe = (0.05 + 0.03 * difficulty) * (0.5 + 0.5 * Math.sin(t * 0.5 + seed))
  const baseHalf = 0.27 - 0.13 * difficulty
  const jitter = 0.02 * (rand() - 0.5)
  const halfGap = Math.max(MIN_HALF_GAP, baseHalf - breathe + jitter)
  const left = Math.max(0.02, center - halfGap)
  const right = Math.min(0.98, center + halfGap)
  return { left, right }
}

/** Difficulty ramps with distance, capped so course shaping stays playable. */
export function difficultyFor(distance: number): number {
  return Math.min(1, Math.max(0, distance) / 600)
}

/** Scroll speed at the start of a run, in course rows per second. */
export const BASE_SCROLL_SPEED = 2.6

/**
 * Scroll speed (rows/second) as a function of distance travelled. It keeps
 * accelerating for the whole run — a quick early ramp tied to `difficulty`
 * plus an unbounded but gently slowing logarithmic creep — so the tunnel never
 * settles into a constant, boring pace. Strictly increasing in distance.
 */
export function scrollSpeedFor(distance: number): number {
  const d = Math.max(0, distance)
  return BASE_SCROLL_SPEED + 4.4 * difficultyFor(d) + Math.log1p(d / 160)
}
