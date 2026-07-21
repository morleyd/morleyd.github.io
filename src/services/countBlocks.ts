/**
 * Count the Blocks — a memory game. A set of tetromino-like shapes slides across
 * the screen; afterward you answer how many there were (and, later, how many of
 * a target shape). Rounds get harder: more shapes, faster, shorter exposure.
 * Generation and difficulty are pure and testable.
 */

import { mulberry32 } from './seed'

export const SHAPES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'] as const
export type Shape = (typeof SHAPES)[number]

export interface Piece {
  shape: Shape
  lane: number // vertical lane index (row it travels along)
  color: string
  /** Fraction along its travel where it starts, so pieces are staggered. */
  startOffset: number
}

export interface Round {
  level: number
  pieces: Piece[]
  target: Shape // "how many <target>?" is asked from level 3 on
  speed: number // lanes-per-second-ish scroll factor (view scales it)
  exposureMs: number // how long the shapes stream past
  lanes: number
}

const COLORS: Record<Shape, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#22c55e',
  Z: '#ef4444',
  L: '#f97316',
  J: '#3b82f6',
}

export const colorOf = (shape: Shape): string => COLORS[shape]

/** How many shapes appear at a given level. */
export function countForLevel(level: number): number {
  return Math.min(24, 3 + level * 2)
}

/** Whether this level asks the harder "how many of shape X" question. */
export function asksTarget(level: number): boolean {
  return level >= 3
}

/** Build a deterministic round for a level from a seed. */
export function makeRound(level: number, seed: string): Round {
  const rng = mulberry32((hash(seed) + level * 2654435761) >>> 0)
  const count = countForLevel(level)
  const lanes = Math.min(8, 4 + Math.floor(level / 2))
  const pieces: Piece[] = []
  for (let i = 0; i < count; i += 1) {
    const shape = SHAPES[Math.floor(rng() * SHAPES.length)]
    pieces.push({ shape, lane: Math.floor(rng() * lanes), color: colorOf(shape), startOffset: 0 })
  }
  // Spread pieces that share a lane into separated time slots so they never
  // overlap on screen and get miscounted.
  const byLane: Piece[][] = Array.from({ length: lanes }, () => [])
  for (const p of pieces) byLane[p.lane].push(p)
  for (const lanePieces of byLane) {
    const m = lanePieces.length
    lanePieces.forEach((p, k) => {
      p.startOffset = (k + 0.5) / m + (rng() - 0.5) * (0.4 / m) // centered in its slot, small jitter
    })
  }
  const target = SHAPES[Math.floor(rng() * SHAPES.length)]
  return {
    level,
    pieces,
    target,
    speed: 0.5 + level * 0.12,
    exposureMs: Math.max(2200, 5200 - level * 260),
    lanes,
  }
}

/** Count pieces matching a shape (answer key for the target question). */
export function countOf(round: Round, shape: Shape): number {
  return round.pieces.filter((p) => p.shape === shape).length
}

/** The correct answer for a round given whether it's the targeted variant. */
export function correctAnswer(round: Round): number {
  return asksTarget(round.level) ? countOf(round, round.target) : round.pieces.length
}

/** Cell layout (unit squares) for drawing each shape, normalized to origin. */
export const SHAPE_CELLS: Record<Shape, Array<[number, number]>> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  L: [[0, 0], [0, 1], [1, 1], [2, 1]],
  J: [[2, 0], [0, 1], [1, 1], [2, 1]],
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
