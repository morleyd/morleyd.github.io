/**
 * Ball Bounce — a doodle-jump-style climber. The ball is always falling under
 * gravity; landing on the TOP of a shelf (only while moving downward) bounces it
 * back up. You steer left/right (with screen wrap). Physics and deterministic,
 * endless shelf generation are pure and testable.
 *
 * Design rules baked in here (see the spec):
 *  - Shelves vary in height (jitter), width and KIND, but the gap between any
 *    two consecutive shelves never exceeds what the bounce below can reach —
 *    the climb is always solvable.
 *  - Special shelves: SUPER springs launch extra high, rare golden ROCKETs
 *    launch absurdly high, CRUMBLE shelves give a weaker bounce and break at
 *    once (the shelf above one is always within the weak bounce's reach), and
 *    FADING shelves dissolve moments after their FIRST bounce — an untouched
 *    fader always waits for you, so the climb can never be stranded, but a
 *    second bounce on one is a race.
 *  - Round bumper obstacles float in the larger gaps, placed away from the
 *    shelves' landing lanes so they never block the required path.
 *  - A shelf breaks (vanishes) after its bounce budget — no camping forever.
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

export type PlatformKind = 'normal' | 'super' | 'rocket' | 'crumble' | 'fading'

export interface Platform {
  x: number // center, 0..1
  y: number
  width: number // fraction of play width
  kind: PlatformKind
}

/** A round obstacle floating between shelves: hitting it knocks the ball away. */
export interface Bumper {
  present: boolean
  x: number
  y: number
  r: number // radius, as a fraction of play width
}

export const GRAVITY = 9 // climb units / s^2
export const BOUNCE_VY = 7.4 // upward speed on a normal bounce
export const MOVE_VX = 0.85 // max horizontal speed from steering input
/** How quickly the ball's vx eases toward the steering target (per second). */
export const STEER_EASE = 12
export const BALL_RADIUS = 0.035

// The play column's shape lives here so bumper collisions (which mix x and y
// units) agree with the view: width / height of the column, and how many climb
// units are visible top-to-bottom.
export const COLUMN_ASPECT = 0.72
export const UNITS_VISIBLE = 7
/** Converts a climb-unit distance into width-fraction units. */
export const Y_TO_X = 1 / (UNITS_VISIBLE * COLUMN_ASPECT)

// Shelf spacing ramps from BASE_SPACING up to MAX_SPACING as you climb, then
// every shelf is jittered up/down by ±Y_JITTER for variety. The worst-case gap
// (MAX_SPACING + 2·Y_JITTER) stays comfortably below the bounce reach.
export const BASE_SPACING = 1.5
export const MAX_SPACING = 2.0
export const SPACING_RAMP = 0.05
export const Y_JITTER = 0.35
export const PLATFORM_WIDTH = 0.3 // nominal width; actual widths vary around it

/** Upward-speed multiplier per shelf kind. */
export const KIND_BOUNCE: Record<PlatformKind, number> = {
  normal: 1,
  super: 1.45,
  rocket: 1.9,
  crumble: 0.8,
  fading: 1,
}

/** How many bounces a shelf of each kind survives (the dissolve usually claims
 *  a fading shelf before its budget does). */
export const KIND_BOUNCES: Record<PlatformKind, number> = {
  normal: 2,
  super: 3,
  rocket: 1,
  crumble: 1,
  fading: 2,
}

/** How long a FADING shelf survives after its first bounce (ms of play time). */
export const FADING_TTL_MS = 1400

/** Back-compat: the bounce budget of a plain shelf. */
export const MAX_BOUNCES = KIND_BOUNCES.normal

// Index at which the spacing ramp hits (and then holds at) MAX_SPACING.
const RAMP_CAP_INDEX =
  SPACING_RAMP > 0 ? Math.floor((MAX_SPACING - BASE_SPACING) / SPACING_RAMP) + 1 : Number.POSITIVE_INFINITY

/** Highest point a bounce of a given kind reaches (v^2 / 2g). */
export const bounceReach = (kind: PlatformKind = 'normal'): number => {
  const v = BOUNCE_VY * KIND_BOUNCE[kind]
  return (v * v) / (2 * GRAVITY)
}

/** Advance the ball. `steer` is -1..1 (analog); screen wraps horizontally. */
export function stepBall(ball: Ball, steer: number, dtMs: number): Ball {
  const dt = dtMs / 1000
  const vy = ball.vy - GRAVITY * dt
  // Ease vx toward the steering target so control is smooth, not twitchy.
  const target = Math.max(-1, Math.min(1, steer)) * MOVE_VX
  const vx = ball.vx + (target - ball.vx) * Math.min(1, STEER_EASE * dt)
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

/** Signed shortest horizontal delta from `from` to `to`, accounting for wrap. */
export function wrapDelta(from: number, to: number): number {
  let d = to - from
  if (d > 0.5) d -= 1
  if (d < -0.5) d += 1
  return d
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
  return { ...ball, y: surface + BALL_RADIUS, vy: BOUNCE_VY * KIND_BOUNCE[platform.kind] }
}

/**
 * If the ball overlaps a bumper, knock it away: horizontal velocity flips away
 * from the bumper and any climb is largely killed, so bumpers cost momentum but
 * are never lethal. Returns null when there's no contact.
 */
export function bounceOffBumper(ball: Ball, bumper: Bumper): Ball | null {
  if (!bumper.present) return null
  const dx = wrapDelta(bumper.x, ball.x)
  const dy = (ball.y - bumper.y) * Y_TO_X
  const rr = bumper.r + BALL_RADIUS
  if (dx * dx + dy * dy >= rr * rr) return null
  const away = dx === 0 ? 1 : Math.sign(dx)
  // Only reposition on side-dominant hits; snapping a top/bottom hit to the rim
  // would teleport the ball sideways. Glancing vertical hits just take the
  // velocity knock and drift clear over the next few frames.
  let x = ball.x
  if (Math.abs(dx) >= Math.abs(dy)) {
    x = bumper.x + away * rr * 1.02 // pushed just clear of the rim
    if (x < 0) x += 1
    if (x >= 1) x -= 1
  }
  return {
    ...ball,
    x,
    vx: away * MOVE_VX * 1.4,
    vy: ball.vy > 0 ? ball.vy * 0.25 : ball.vy,
  }
}

/** Gap between shelf `index - 1` and shelf `index` before jitter (0 for index <= 0). */
export function spacingBefore(index: number): number {
  if (index <= 0) return 0
  return Math.min(MAX_SPACING, BASE_SPACING + (index - 1) * SPACING_RAMP)
}

/** Cumulative pre-jitter world-y of a shelf index (ramping spacing, then capped). */
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

/**
 * Index of the shelf nearest a y, for narrowing collision/draw checks. Jitter
 * moves a shelf at most Y_JITTER from its pre-jitter y, so scanning ±2 indices
 * around this is always enough.
 */
export const nearestPlatformIndex = (y: number): number => Math.max(0, Math.round(indexAtY(y)))

/** True once a shelf has used up its kind's bounce budget. */
export const platformBroken = (bounces: number, kind: PlatformKind = 'normal'): boolean =>
  bounces >= KIND_BOUNCES[kind]

/**
 * The displayed Height score for a climbed world-y. The ball starts at ~0 and y
 * only trends upward, so the best score is `heightScore(maxY)`. Clamped at 0 so
 * a tiny initial dip never shows a negative height.
 */
export const heightScore = (maxY: number): number => Math.max(0, Math.round(maxY * 10))

/** Running max of the climbed height — the tracked peak only ever rises. */
export const trackMaxHeight = (prevMax: number, y: number): number => Math.max(prevMax, y)

const randFor = (seed: number, index: number, salt: number) =>
  mulberry32((seed + index * 2654435761 + salt * 40503) >>> 0)

/** Per-shelf vertical jitter (0 for the start shelf). */
function jitterAt(seed: number, index: number): number {
  if (index <= 0) return 0
  return (randFor(seed, index, 1)() - 0.5) * 2 * Y_JITTER
}

/** The jittered world-y of a shelf. */
export const platformYAt = (seed: number, index: number): number =>
  platformY(index) + jitterAt(seed, index)

/** Actual (post-jitter) gap between shelf `index` and the shelf above it. */
export function gapAbove(seed: number, index: number): number {
  return platformYAt(seed, index + 1) - platformYAt(seed, index)
}

// Safety margin between a bounce's peak and the gap it must clear, leaving time
// to steer sideways onto the shelf.
const REACH_MARGIN = 0.3

/**
 * The KIND of a shelf. Pure per-index; special kinds only appear a few shelves
 * up, and a CRUMBLE shelf (weak bounce, breaks at once) is only allowed when
 * the shelf above it sits within the weak bounce's reach — so the run is always
 * completable no matter which shelves you use. FADING shelves need no such
 * guard: their dissolve clock starts at their FIRST BOUNCE (see the view), so
 * an untouched fader is always there when you arrive.
 */
export function platformKindAt(seed: number, index: number): PlatformKind {
  if (index <= 3) return 'normal'
  const roll = randFor(seed, index, 2)()
  if (roll < 0.008) return 'rocket'
  if (roll < 0.08) return 'super'
  if (roll < 0.17 && index >= 6) return 'fading'
  if (roll < 0.3 && gapAbove(seed, index) <= bounceReach('crumble') - REACH_MARGIN) return 'crumble'
  return 'normal'
}

/**
 * Deterministic shelf for a given index. Shelves climb by the ramping spacing
 * (plus vertical jitter), wander horizontally, and vary in width — trending
 * narrower as you climb.
 */
export function platformAt(seed: number, index: number): Platform {
  const rand = randFor(seed, index, 0)
  const shrink = Math.min(0.1, index * 0.0008)
  const width = Math.max(0.13, PLATFORM_WIDTH - shrink + (rand() - 0.5) * 0.12)
  return {
    x: width / 2 + rand() * (1 - width),
    y: platformYAt(seed, index),
    width,
    kind: platformKindAt(seed, index),
  }
}

const BUMPER_R = 0.055
/** Clearance a bumper keeps from each neighboring shelf's landing lane. */
const BUMPER_LANE_CLEAR = 0.3

/**
 * The bumper (if any) floating in the gap between shelf `index` and the shelf
 * above. Only larger gaps get one, and it is placed away from both shelves'
 * centers so the direct climbing lane is never blocked.
 */
export function bumperAt(seed: number, index: number): Bumper {
  const none: Bumper = { present: false, x: 0, y: 0, r: BUMPER_R }
  if (index < 8) return none
  const rand = randFor(seed, index, 3)
  if (rand() > 0.22) return none
  const gap = gapAbove(seed, index)
  if (gap < 1.6) return none
  const below = platformAt(seed, index)
  const above = platformAt(seed, index + 1)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const x = rand()
    if (wrapDist(x, below.x) >= BUMPER_LANE_CLEAR && wrapDist(x, above.x) >= BUMPER_LANE_CLEAR) {
      return { present: true, x, y: below.y + gap * (0.4 + rand() * 0.2), r: BUMPER_R }
    }
  }
  return none
}
