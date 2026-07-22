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

// Charge power oscillates while held: a triangle wave that sweeps min → max →
// min → max over CHARGE_PERIOD_MS, so the player must time the release to lock
// in the power they want. Holding for exactly half a period lands on full power,
// so MAX_CHARGE_MS (the hold that yields MAX_JUMP_VY) is that half-period.
//
// The hold duration fed in is wall-clock milliseconds (measured against a single
// monotonic clock, not accumulated per frame), so the sweep takes the same real
// time on a 30fps phone as on a 120fps desktop. The period is a comfortable
// ~1.4s so a player can watch the meter rise and release at the power they want.
export const CHARGE_PERIOD_MS = 1400 // one full min→max→min sweep (wall-clock ms)
export const MAX_CHARGE_MS = CHARGE_PERIOD_MS / 2 // hold time at the first power peak

export const initialNinja = (): NinjaState => ({
  side: -1,
  x: WALL_X['-1'],
  y: 0,
  vx: 0,
  vy: 0,
  airborne: false,
})

/**
 * Map a hold duration (ms) to jump vertical speed via an oscillating triangle
 * wave: power rises from MIN_JUMP_VY to MAX_JUMP_VY over the first half of
 * CHARGE_PERIOD_MS, falls back to MIN over the second half, then repeats. The
 * peak is MAX_JUMP_VY, so the jump apex is always clamped to MAX_JUMP_HEIGHT and
 * the ninja can never leave the screen no matter how long the hold.
 */
export function chargeToVy(holdMs: number): number {
  const phase = (Math.max(0, holdMs) % CHARGE_PERIOD_MS) / CHARGE_PERIOD_MS
  const tri = 1 - Math.abs(2 * phase - 1) // 0 at phase 0, 1 at phase 0.5, 0 at phase 1
  return MIN_JUMP_VY + tri * (MAX_JUMP_VY - MIN_JUMP_VY)
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
  present: boolean // sparse rows near the bottom leave many slots empty
}

/**
 * Deterministic, endless spikes that get harder with height. Rows are spaced
 * every `SPIKE_SPACING` climb units, but difficulty ramps in over height:
 *
 *  - A spike-free warm-up (`SPIKE_WARMUP`) at the very bottom lets the player
 *    find their footing.
 *  - Above it, only a fraction of rows actually hold a spike (`spikePresenceProb`),
 *    starting sparse and rising to fully populated — so effective spacing tightens
 *    with height.
 *  - Spikes also grow (`spikeHalfAt`) from `SPIKE_HALF_MIN` to `SPIKE_HALF_MAX`.
 *
 * Each occupied row still places a spike on only one wall, so a jump is always
 * survivable. The ramp completes over `SPIKE_DENSITY_HEIGHT` climb units.
 */
export const SPIKE_SPACING = 1.3
export const SPIKE_WARMUP = 3.0 // spike-free climb units at the bottom
export const SPIKE_DENSITY_HEIGHT = 26 // height over which difficulty ramps to max
export const SPIKE_PRESENCE_MIN = 0.4 // fraction of rows occupied at the start
export const SPIKE_PRESENCE_MAX = 1.0 // fraction of rows occupied at full difficulty
export const SPIKE_HALF_MIN = 0.22 // spike half-height near the start
export const SPIKE_HALF_MAX = 0.42 // spike half-height at full difficulty
export const SPIKE_REACH = 0.09 // how far a spike's danger zone juts in from its wall (x units)

/** Normalised difficulty (0 during warm-up, ramping to 1) at a given height. */
export function spikeDifficulty(y: number): number {
  return Math.max(0, Math.min(1, (y - SPIKE_WARMUP) / SPIKE_DENSITY_HEIGHT))
}

/** Probability that a given row actually holds a spike at height `y`. */
export function spikePresenceProb(y: number): number {
  return SPIKE_PRESENCE_MIN + spikeDifficulty(y) * (SPIKE_PRESENCE_MAX - SPIKE_PRESENCE_MIN)
}

/** Spike half-height (danger radius) at height `y` — grows with difficulty. */
export function spikeHalfAt(y: number): number {
  return SPIKE_HALF_MIN + spikeDifficulty(y) * (SPIKE_HALF_MAX - SPIKE_HALF_MIN)
}

export function spikeAt(seed: number, index: number): Spike {
  const rand = mulberry32((seed + index * 2654435761) >>> 0)
  const side: Wall = rand() < 0.5 ? -1 : 1
  const jitter = (rand() - 0.5) * 0.4
  const y = SPIKE_WARMUP + index * SPIKE_SPACING + jitter
  const present = index >= 0 && rand() < spikePresenceProb(y)
  return { side, y, half: spikeHalfAt(y), present }
}

/**
 * Whether the ninja is impaled on a nearby spike. A spike can catch the ninja
 * whether it is clinging to that wall or still airborne but within the spike's
 * reach of it — so flying into a spike is fatal, not only landing on one. When
 * the ninja is out in the middle of the shaft (near neither wall) it is safe.
 *
 * Crucially, a spike on the wall the ninja just LAUNCHED FROM cannot catch it:
 * while airborne and still moving away from a wall (departing it), that wall's
 * spikes are ignored, so a ninja rising off a wall next to a spike is not killed
 * by its own wall. Only the wall it is moving toward (arriving at), or a wall it
 * is grounded on, is lethal — so flying into or landing on a spike still kills.
 */
export function hitsSpike(state: NinjaState, seed: number): boolean {
  const leftX = WALL_X['-1']
  const rightX = WALL_X['1']
  let side: Wall | 0 = 0
  if (state.x <= leftX + SPIKE_REACH) side = -1
  else if (state.x >= rightX - SPIKE_REACH) side = 1
  if (side === 0) return false

  // Departing this wall (airborne and moving away from it) — it's the wall we
  // launched off, so its spikes can't catch us on the way up/out.
  if (state.airborne && state.vx * side < 0) return false

  const nearestIndex = Math.round((state.y - SPIKE_WARMUP) / SPIKE_SPACING)
  for (let i = Math.max(0, nearestIndex - 1); i <= nearestIndex + 1; i += 1) {
    const spike = spikeAt(seed, i)
    if (spike.present && spike.side === side && Math.abs(spike.y - state.y) < spike.half) return true
  }
  return false
}

// --- Rising lava --------------------------------------------------------------
// The lava rises from below and its speed accelerates the longer the run lasts,
// so dawdling gets punished more and more. To keep it genuinely outrunnable, the
// ceiling is derived from the ninja's own sustainable climb rate (below) rather
// than picked by feel.

/**
 * The ninja's sustainable average climb speed (climb units / s), assuming a
 * skilled player chains full-power jumps: each jump gains `heightPerJump` over
 * the time it takes to fly across the shaft plus the hold needed to reach full
 * charge. The lava ceiling is set safely below this so the climb is always
 * winnable.
 */
export function climbSpeed(): number {
  const gap = WALL_X['1'] - WALL_X['-1']
  const crossS = gap / JUMP_VX // time in the air crossing to the far wall
  const heightPerJump = MAX_JUMP_VY * crossS - 0.5 * GRAVITY * crossS * crossS
  const cycleS = crossS + MAX_CHARGE_MS / 1000 // flight + time to charge to full
  return heightPerJump / cycleS
}

export const LAVA_BASE_SPEED = 0.28 // rise speed at the start (climb units / s)
export const LAVA_ACCEL = 0.045 // extra rise speed gained per second elapsed
// Ceiling kept at ~65% of the achievable climb rate: gentle acceleration, but a
// skilled climber can always pull away.
export const LAVA_MAX_SPEED = 0.65 * climbSpeed() // ceiling on the rise speed (climb units / s)

/** Current lava rise speed for a run that has been going `elapsedMs` ms. */
export function lavaSpeed(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000
  return Math.min(LAVA_MAX_SPEED, LAVA_BASE_SPEED + LAVA_ACCEL * t)
}

/** Advance the lava surface by dtMs, using the (accelerating) speed for `elapsedMs`. */
export function stepLava(dangerY: number, elapsedMs: number, dtMs: number): number {
  return dangerY + (lavaSpeed(elapsedMs) * dtMs) / 1000
}
