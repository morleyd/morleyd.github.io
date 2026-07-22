/**
 * Ball Bounce — a doodle-jump-style climber. The ball is always falling under
 * gravity; landing on the TOP of a shelf (only while moving downward) bounces it
 * back up. You steer left/right (with screen wrap). Physics and deterministic,
 * endless shelf generation are pure and testable.
 *
 * Design rules baked in here (see the spec):
 *  - The bounce clearly overshoots the next shelf so climbing is reliable.
 *  - Shelves are spaced FURTHER apart the higher you climb (difficulty ramp),
 *    but never further than the bounce can reach.
 *  - A shelf breaks (vanishes) after MAX_BOUNCES bounces — no bouncing forever
 *    on one shelf.
 *
 * Coordinates: x in [0,1] (wraps), y in climb units that only trend upward.
 * The view scales to pixels; velocities are per second.
 */

import { mulberry32 } from './seed'

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number // up is positive
}

export interface Platform {
  x: number // center, 0..1
  y: number
  width: number // fraction of play width
}

export const GRAVITY = 9 // climb units / s^2
export const BOUNCE_VY = 7.4 // upward speed on a bounce (reaches well past MAX_SPACING)
export const MOVE_VX = 0.85 // horizontal speed from steering input
export const BALL_RADIUS = 0.035

// Shelf spacing ramps from BASE_SPACING up to MAX_SPACING as you climb.
export const BASE_SPACING = 1.5 // gap between the first shelves (units)
export const MAX_SPACING = 2.3 // gap the ramp tops out at (kept below the bounce reach)
export const SPACING_RAMP = 0.06 // extra gap added per shelf index until capped
export const PLATFORM_WIDTH = 0.26

/** A shelf disappears once it has been bounced on this many times. */
export const MAX_BOUNCES = 2

// Index at which the spacing ramp hits (and then holds at) MAX_SPACING.
const RAMP_CAP_INDEX =
  SPACING_RAMP > 0 ? Math.floor((MAX_SPACING - BASE_SPACING) / SPACING_RAMP) + 1 : Number.POSITIVE_INFINITY

/** Highest point a fresh bounce reaches (v^2 / 2g). Must exceed MAX_SPACING. */
export const bounceReach = (): number => (BOUNCE_VY * BOUNCE_VY) / (2 * GRAVITY)

/** Advance the ball. `steer` is -1/0/1; screen wraps horizontally. */
export function stepBall(ball: Ball, steer: -1 | 0 | 1, dtMs: number): Ball {
  const dt = dtMs / 1000
  const vy = ball.vy - GRAVITY * dt
  const vx = steer * MOVE_VX
  let x = ball.x + vx * dt
  if (x < 0) x += 1
  if (x >= 1) x -= 1
  const y = ball.y + vy * dt
  return { x, y, vx, vy }
}

/** Horizontal distance between two x's accounting for wrap (0..0.5). */
export function wrapDist(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

/**
 * If the ball is falling and lands on the TOP of a shelf this step, return the
 * bounced ball; otherwise null. `prevY` is the ball's y before the step.
 *
 * Top-surface-only: we require the ball to be moving downward (vy <= 0) AND to
 * have been at or above the surface last step (prevY >= surface). A ball rising
 * up through the shelf, or one already below it, never bounces — so there are no
 * side or underneath bounces. The prevY check also prevents fast-fall tunneling.
 */
export function tryBounce(ball: Ball, prevY: number, platform: Platform): Ball | null {
  if (ball.vy > 0) return null // moving up — pass through
  const surface = platform.y
  const crossed = prevY >= surface && ball.y <= surface + BALL_RADIUS
  if (!crossed) return null
  if (wrapDist(ball.x, platform.x) > platform.width / 2 + BALL_RADIUS) return null
  return { ...ball, y: surface + BALL_RADIUS, vy: BOUNCE_VY }
}

/** Gap between shelf `index - 1` and shelf `index` (0 for index <= 0). */
export function spacingBefore(index: number): number {
  if (index <= 0) return 0
  return Math.min(MAX_SPACING, BASE_SPACING + (index - 1) * SPACING_RAMP)
}

/** Cumulative world-y of a shelf index (spacing ramps then caps at MAX_SPACING). */
export function platformY(index: number): number {
  if (index <= 0) return 0
  const linN = Math.min(index, RAMP_CAP_INDEX)
  // sum_{k=1..linN} (BASE_SPACING + (k-1)*SPACING_RAMP)
  let y = linN * BASE_SPACING + (SPACING_RAMP * (linN - 1) * linN) / 2
  if (index > RAMP_CAP_INDEX) y += (index - RAMP_CAP_INDEX) * MAX_SPACING
  return y
}

const Y_AT_CAP = platformY(RAMP_CAP_INDEX)

/** Continuous inverse of platformY: the (fractional) index at a given y. */
function indexAtY(y: number): number {
  if (y <= 0) return 0
  if (SPACING_RAMP === 0) return y / BASE_SPACING
  if (y <= Y_AT_CAP) {
    // Solve a*n^2 + b*n - y = 0 for n, with a = ramp/2, b = BASE - ramp/2.
    const a = SPACING_RAMP / 2
    const b = BASE_SPACING - SPACING_RAMP / 2
    return (-b + Math.sqrt(b * b + 4 * a * y)) / (2 * a)
  }
  return RAMP_CAP_INDEX + (y - Y_AT_CAP) / MAX_SPACING
}

/** Index of the shelf nearest a y, for narrowing collision/draw checks. */
export const nearestPlatformIndex = (y: number): number => Math.max(0, Math.round(indexAtY(y)))

/** True once a shelf has been bounced on enough times to vanish. */
export const platformBroken = (bounces: number): boolean => bounces >= MAX_BOUNCES

/**
 * The displayed Height score for a climbed world-y. The ball starts at ~0 and y
 * only trends upward, so the best score is `heightScore(maxY)`. Clamped at 0 so
 * a tiny initial dip never shows a negative height.
 */
export const heightScore = (maxY: number): number => Math.max(0, Math.round(maxY * 10))

/** Running max of the climbed height — the tracked peak only ever rises. */
export const trackMaxHeight = (prevMax: number, y: number): number => Math.max(prevMax, y)

/**
 * Deterministic shelf for a given index. Shelves climb by the ramping spacing
 * and wander horizontally; higher shelves get slightly narrower.
 */
export function platformAt(seed: number, index: number): Platform {
  const rand = mulberry32((seed + index * 2654435761) >>> 0)
  const width = Math.max(0.14, PLATFORM_WIDTH - index * 0.0009)
  return {
    x: width / 2 + rand() * (1 - width),
    y: platformY(index),
    width,
  }
}
