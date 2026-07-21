/**
 * Ball Bounce — a doodle-jump-style climber. The ball is always falling under
 * gravity; landing on a platform (only while moving downward) bounces it back
 * up. You steer left/right (with screen wrap). Physics and deterministic,
 * endless platform generation are pure and testable.
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
export const BOUNCE_VY = 4.6 // upward speed on a bounce
export const MOVE_VX = 0.75 // horizontal speed from steering input
export const BALL_RADIUS = 0.035
export const PLATFORM_SPACING = 0.72 // vertical gap between platforms (units)
export const PLATFORM_WIDTH = 0.26

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
 * If the ball is falling and overlaps the top of a platform this step, return
 * the bounced ball; otherwise null. `prevY` is the ball's y before the step, so
 * we only bounce when it crosses the platform surface downward (no tunneling).
 */
export function tryBounce(ball: Ball, prevY: number, platform: Platform): Ball | null {
  if (ball.vy > 0) return null // moving up — pass through
  const surface = platform.y
  const crossed = prevY >= surface && ball.y <= surface + BALL_RADIUS
  if (!crossed) return null
  if (wrapDist(ball.x, platform.x) > platform.width / 2 + BALL_RADIUS) return null
  return { ...ball, y: surface + BALL_RADIUS, vy: BOUNCE_VY }
}

/**
 * Deterministic platform for a given index. Platforms climb by PLATFORM_SPACING
 * and wander horizontally; higher platforms get slightly narrower.
 */
export function platformAt(seed: number, index: number): Platform {
  const rand = mulberry32((seed + index * 2654435761) >>> 0)
  const width = Math.max(0.14, PLATFORM_WIDTH - index * 0.0009)
  return {
    x: width / 2 + rand() * (1 - width),
    y: index * PLATFORM_SPACING,
    width,
  }
}

/** Index of the platform nearest a y, for narrowing collision checks. */
export const nearestPlatformIndex = (y: number): number => Math.round(y / PLATFORM_SPACING)
