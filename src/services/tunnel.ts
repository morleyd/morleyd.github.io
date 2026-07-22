/**
 * Vertical tunnel flapper — physics and course generation, kept pure so the
 * game loop in the view stays a thin driver and the tricky bits are testable.
 *
 * It's Flappy-Bird, rotated: a ball flaps its way UP a weaving tunnel. GRAVITY
 * constantly pulls the ball down; each tap FLAPS it back up (and nudges it left
 * or right toward the tapped side). The camera climbs to follow the ball's
 * height and never scrolls back down, so if the ball sinks off the bottom of
 * the visible course — or clips a wall — the run is over. "Distance" (score) is
 * how many course rows the ball has climbed.
 *
 * Horizontal lengths are a fraction of the play WIDTH and vertical positions are
 * measured in course ROWS, so the model is resolution-independent; the view
 * multiplies by its pixels.
 */

import { mulberry32 } from './seed'

export interface FlyerState {
  x: number // horizontal center, 0..1
  vx: number // horizontal velocity, fraction of width per second
  y: number // height in course rows, increases as the ball climbs
  vy: number // vertical velocity in rows per second (+ is up)
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

// Vertical physics, in course rows. Gravity is a constant downward pull; a flap
// resets the upward velocity to a fixed impulse (Flappy-Bird style — it sets,
// not adds), so a steady rhythm hovers and a brisker one climbs. Tuned against a
// viewport ~10 rows tall: one flap arcs up ≈ FLAP_VY²/(2·GRAVITY) ≈ 1 row, and a
// player who taps a touch faster than ~1.5 Hz keeps net-rising.
export const GRAVITY = 20 // rows per second², pulls the ball down
export const FLAP_VY = 6.5 // rows per second of upward velocity per flap

// Where the ball rests on screen while the camera is tracking it, as a fraction
// up from the bottom edge. Leaves room above to read the upcoming tunnel and
// room below (≈ VIEW_ANCHOR · viewRows) to recover from a dive before falling
// off the bottom.
export const VIEW_ANCHOR = 0.4

/**
 * Advance the flyer one frame. Horizontal velocity decays exponentially so taps
 * feel snappy but drift settles; vertically, gravity is integrated with
 * semi-implicit Euler (update velocity, then position) for stability. dtMs is
 * the frame time in milliseconds.
 */
export function stepFlyer(state: FlyerState, dtMs: number): FlyerState {
  const dt = dtMs / 1000
  // Horizontal: decaying drift, clamped to the play area.
  const decayedVx = state.vx * Math.exp(-3 * dt)
  let x = state.x + decayedVx * dt
  let vx = decayedVx
  if (x < FLYER_RADIUS) {
    x = FLYER_RADIUS
    vx = 0
  } else if (x > 1 - FLYER_RADIUS) {
    x = 1 - FLYER_RADIUS
    vx = 0
  }
  // Vertical: gravity pulls down; nothing clamps it — sinking too far is death.
  const vy = state.vy - GRAVITY * dt
  const y = state.y + vy * dt
  return { x, vx, y, vy }
}

/** Apply a horizontal nudge toward -1 (left) or +1 (right). */
export function flap(state: FlyerState, dir: -1 | 1): FlyerState {
  return { ...state, vx: dir * FLAP_VX }
}

/** Flap upward: reset vertical velocity to the fixed upward impulse. */
export function flapUp(state: FlyerState): FlyerState {
  return { ...state, vy: FLAP_VY }
}

/** True if the flyer at center x overlaps either wall of a segment. */
export function collides(x: number, seg: Segment): boolean {
  return x - FLYER_RADIUS < seg.left || x + FLYER_RADIUS > seg.right
}

/**
 * The camera's bottom edge (in rows) after the ball reaches height y. It rises
 * to keep the ball VIEW_ANCHOR of the way up the screen but never scrolls back
 * down, so climbing pans the course while sinking runs the ball toward the
 * bottom edge. `prev` is the previous bottom (pass -Infinity to initialise).
 */
export function cameraBottomFor(prev: number, y: number, viewRows: number): number {
  return Math.max(prev, y - VIEW_ANCHOR * viewRows)
}

/** True once the ball has sunk below the bottom of the visible course. */
export function hasFallenOff(y: number, cameraBottom: number): boolean {
  return y < cameraBottom
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

/** Difficulty ramps with how high you climb, capped so shaping stays playable. */
export function difficultyFor(distance: number): number {
  return Math.min(1, Math.max(0, distance) / 400)
}
