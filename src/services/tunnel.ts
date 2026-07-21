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

export const FLAP_VX = 0.9 // horizontal speed imparted by a flap
export const FLYER_RADIUS = 0.045 // as a fraction of width

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

/**
 * Generate the tunnel as a deterministic function of a seed and a row index, so
 * the course is reproducible and endless. The gap drifts left/right smoothly and
 * narrows as `difficulty` (0..1) rises. Always leaves a passable gap.
 */
export function segmentAt(seed: number, row: number, difficulty = 0): Segment {
  const rand = mulberry32((seed + row * 2654435761) >>> 0)
  const t = row * 0.15
  // Smooth drifting centerline kept away from the edges.
  const center = 0.5 + 0.26 * Math.sin(t) + 0.1 * Math.sin(t * 2.3 + seed)
  const halfGap = Math.max(0.1, 0.28 - 0.12 * difficulty + 0.02 * (rand() - 0.5))
  const left = Math.max(0.02, center - halfGap)
  const right = Math.min(0.98, center + halfGap)
  return { left, right }
}

/** Difficulty ramps with distance, capped so it stays playable. */
export function difficultyFor(distance: number): number {
  return Math.min(1, distance / 600)
}
