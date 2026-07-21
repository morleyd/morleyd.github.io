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
export const MIN_JUMP_VY = 1.2
export const MAX_JUMP_VY = 2.6
export const MAX_CHARGE_MS = 420 // press duration for a full-power jump

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

export function spikeAt(seed: number, index: number): Spike {
  const rand = mulberry32((seed + index * 2654435761) >>> 0)
  const side: Wall = rand() < 0.5 ? -1 : 1
  const jitter = (rand() - 0.5) * 0.5
  return { side, y: (index + 1) * SPIKE_SPACING + jitter, half: SPIKE_HALF }
}

/** Whether the ninja (clinging or passing a wall) is impaled on any nearby spike. */
export function hitsSpike(state: NinjaState, seed: number): boolean {
  // Only a spike on the wall the ninja is touching can hit it.
  if (state.airborne) {
    // In-air: check the wall it's closest to only if actually against it.
    return false
  }
  const nearestIndex = Math.round(state.y / SPIKE_SPACING)
  for (let i = Math.max(0, nearestIndex - 1); i <= nearestIndex + 1; i += 1) {
    const spike = spikeAt(seed, i)
    if (spike.side === state.side && Math.abs(spike.y - state.y) < spike.half) return true
  }
  return false
}
