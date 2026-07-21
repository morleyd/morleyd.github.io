/**
 * Ninja wall-jump — physics and hazard generation, pure and testable. The ninja
 * clings to the left or right wall and jumps across to the other wall; hold
 * longer to jump higher. Spikes jut from the walls; touching one ends the run.
 *
 * Coordinates: x in [0,1] across the shaft; y in "climb units" that only
 * increase. The view scales both to pixels. Gravity/velocity are per second.
 */

import { mulberry32 } from './seed'

export type Wall = -1 | 1 // -1 = left, +1 = right

export interface NinjaState {
  side: Wall // wall currently clung to (when grounded)
  x: number // 0 (left wall) .. 1 (right wall)
  y: number // climb height, only grows
  vx: number // horizontal velocity
  vy: number // vertical velocity (up is positive)
  airborne: boolean
}

export const GRAVITY = 2.6 // downward accel (climb units / s^2)
export const WALL_X = { '-1': 0.12, '1': 0.88 } as const // cling x per wall
export const JUMP_VX = 0.9 // horizontal jump speed

// A wide gap between a tap and a full hold makes charging feel meaningful: a
// short tap barely clears the shaft (and can even dip), while a full charge
// arcs high. The apex is capped by MAX_JUMP_HEIGHT so the ninja can never fly
// off the top of the view, and horizontal motion is bounded by the two walls,
// so a jump is always kept within screen bounds.
export const MAX_JUMP_HEIGHT = 1.9 // max apex above the launch point (climb units)
export const MIN_JUMP_VY = 0.5
export const MAX_JUMP_VY = Math.sqrt(2 * GRAVITY * MAX_JUMP_HEIGHT) // apex === MAX_JUMP_HEIGHT
export const MAX_CHARGE_MS = 620 // press duration for a full-power jump

export const initialNinja = (): NinjaState => ({
  side: -1,
  x: WALL_X['-1'],
  y: 0,
  vx: 0,
  vy: 0,
  airborne: false,
})

/** Map a hold duration (ms) to jump vertical speed, clamped and eased linearly. */
export function chargeToVy(holdMs: number): number {
  const t = Math.max(0, Math.min(1, holdMs / MAX_CHARGE_MS))
  return MIN_JUMP_VY + t * (MAX_JUMP_VY - MIN_JUMP_VY)
}

/**
 * Launch the ninja off its current wall toward the other one. Higher `holdMs`
 * gives more upward speed. No-op if already airborne.
 */
export function jump(state: NinjaState, holdMs: number): NinjaState {
  if (state.airborne) return state
  return {
    ...state,
    airborne: true,
    vx: -state.side * JUMP_VX, // toward the opposite wall
    vy: chargeToVy(holdMs),
  }
}

/**
 * Advance physics by dtMs. While airborne, gravity pulls the ninja down and it
 * flies toward the far wall; on reaching a wall it clings (vx/vy reset) at the
 * higher of its current height (you never slide back down below a wall touch).
 */
export function stepNinja(state: NinjaState, dtMs: number): NinjaState {
  if (!state.airborne) return state
  const dt = dtMs / 1000
  const vy = state.vy - GRAVITY * dt
  const x = state.x + state.vx * dt
  const y = state.y + vy * dt

  const leftX = WALL_X['-1']
  const rightX = WALL_X['1']
  if (x <= leftX && state.vx < 0) {
    return { side: -1, x: leftX, y, vx: 0, vy: 0, airborne: false }
  }
  if (x >= rightX && state.vx > 0) {
    return { side: 1, x: rightX, y, vx: 0, vy: 0, airborne: false }
  }
  return { ...state, x, y, vy }
}

/**
 * Predict the flight path of a jump of the given hold duration, as world-space
 * {x, y} points from launch until the ninja clings to the far wall (or a step
 * cap). Used to draw the charge arc preview; because it reuses `jump`/`stepNinja`
 * the preview matches the real leap, and both are bounded (x between the walls,
 * apex ≤ MAX_JUMP_HEIGHT) so the arc never leaves the playfield.
 */
export function predictTrajectory(
  state: NinjaState,
  holdMs: number,
  maxSteps = 60,
  dtMs = 16,
): { x: number; y: number }[] {
  if (state.airborne) return []
  let s = jump(state, holdMs)
  const points: { x: number; y: number }[] = [{ x: s.x, y: s.y }]
  for (let i = 0; i < maxSteps && s.airborne; i += 1) {
    s = stepNinja(s, dtMs)
    points.push({ x: s.x, y: s.y })
  }
  return points
}

/** A spike hazard on one wall at a given height, with a vertical half-extent. */
export interface Spike {
  side: Wall
  y: number
  half: number // half-height of the spike's danger zone (climb units)
}

/**
 * Deterministic, endless spikes. Spikes are spaced roughly every `SPACING`
 * climb units; each row places a spike on one wall (never both, so a jump is
 * always survivable). Density is fixed; the challenge comes from timing.
 */
export const SPIKE_SPACING = 1.4
export const SPIKE_HALF = 0.32
export const SPIKE_REACH = 0.09 // how far a spike's danger zone juts in from its wall (x units)

export function spikeAt(seed: number, index: number): Spike {
  const rand = mulberry32((seed + index * 2654435761) >>> 0)
  const side: Wall = rand() < 0.5 ? -1 : 1
  const jitter = (rand() - 0.5) * 0.5
  return { side, y: (index + 1) * SPIKE_SPACING + jitter, half: SPIKE_HALF }
}

/**
 * Whether the ninja is impaled on a nearby spike. A spike can catch the ninja
 * whether it is clinging to that wall or still airborne but within the spike's
 * reach of it — so flying into a spike is fatal, not only landing on one. When
 * the ninja is out in the middle of the shaft (near neither wall) it is safe.
 */
export function hitsSpike(state: NinjaState, seed: number): boolean {
  const leftX = WALL_X['-1']
  const rightX = WALL_X['1']
  let side: Wall | 0 = 0
  if (state.x <= leftX + SPIKE_REACH) side = -1
  else if (state.x >= rightX - SPIKE_REACH) side = 1
  if (side === 0) return false

  const nearestIndex = Math.round(state.y / SPIKE_SPACING)
  for (let i = Math.max(0, nearestIndex - 1); i <= nearestIndex + 1; i += 1) {
    const spike = spikeAt(seed, i)
    if (spike.side === side && Math.abs(spike.y - state.y) < spike.half) return true
  }
  return false
}

// --- Rising lava --------------------------------------------------------------
// The lava rises from below and its speed accelerates the longer the run lasts,
// so dawdling gets punished more and more. Speed is a function of elapsed time,
// capped so it stays outrunnable in principle.
export const LAVA_BASE_SPEED = 0.35 // rise speed at the start (climb units / s)
export const LAVA_ACCEL = 0.16 // extra rise speed gained per second elapsed
export const LAVA_MAX_SPEED = 3.2 // ceiling on the rise speed (climb units / s)

/** Current lava rise speed for a run that has been going `elapsedMs` ms. */
export function lavaSpeed(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000
  return Math.min(LAVA_MAX_SPEED, LAVA_BASE_SPEED + LAVA_ACCEL * t)
}

/** Advance the lava surface by dtMs, using the (accelerating) speed for `elapsedMs`. */
export function stepLava(dangerY: number, elapsedMs: number, dtMs: number): number {
  return dangerY + (lavaSpeed(elapsedMs) * dtMs) / 1000
}
