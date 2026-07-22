/**
 * Count the Blocks — a memory game. A SINGLE cohesive pattern of blocks is
 * shown for a short time; then you answer how many blocks were in it. The
 * asked quantity is always the total number of blocks shown, so what you count
 * is exactly the correct answer — in BOTH presentation modes:
 *   - Normal: the pattern is flashed statically on the grid.
 *   - Hard: the same one cohesive group slides across the screen and you count
 *     the blocks as they stream past.
 * The generated cluster (positions + count) is identical for a given
 * level/seed regardless of mode, so the answer is never ambiguous; only how
 * long it is shown changes. Rounds get harder: more blocks, a bigger grid, and
 * a shorter reveal. Generation is pure and testable.
 */

import { mulberry32 } from './seed'

/** How the pattern is presented: a static flash, or a sliding stream. */
export type CountMode = 'normal' | 'hard'

export interface Cell {
  x: number // grid column
  y: number // grid row
  color: string
}

export interface Round {
  level: number
  /** How the pattern is presented (flash vs. sliding stream). */
  mode: CountMode
  /** The one cohesive pattern of blocks the player must count. */
  cells: Cell[]
  cols: number
  rows: number
  /** How long the pattern is shown (flash duration / slide traversal time). */
  exposureMs: number
  /** The number of blocks in the pattern — this IS the correct answer. */
  blockCount: number
}

/** Per-block fill colors, cycled so the pattern reads as a mosaic of blocks. */
export const PALETTE = [
  '#22d3ee',
  '#facc15',
  '#a855f7',
  '#22c55e',
  '#ef4444',
  '#f97316',
  '#3b82f6',
  '#ec4899',
] as const

/** How many blocks appear at a given level (ramps up, then caps). */
export function countForLevel(level: number): number {
  return Math.min(30, 3 + level * 2)
}

/** Square grid side length for a given block count (with breathing room). */
export function gridSizeForCount(count: number): number {
  return Math.min(12, Math.max(4, Math.ceil(Math.sqrt(count)) + 2))
}

/**
 * How long the pattern is shown (ms): eases down as the level rises. Hard mode
 * lasts longer because the group has to slide the whole way across the screen —
 * that traversal time is what makes the blocks countable as they stream past.
 */
export function exposureForLevel(level: number, mode: CountMode = 'normal'): number {
  const count = countForLevel(level)
  const base = Math.max(900, Math.round(2000 + count * 40 - level * 150))
  return mode === 'hard' ? Math.round(base * 1.6) : base
}

const key = (x: number, y: number): string => `${x},${y}`
const neighbors = (x: number, y: number): Array<[number, number]> => [
  [x + 1, y],
  [x - 1, y],
  [x, y + 1],
  [x, y - 1],
]

/**
 * Build a deterministic round for a level from a seed. The blocks form ONE
 * connected cluster grown from the grid center, so the reveal is a single
 * cohesive pattern rather than a scatter of separate pieces.
 */
export function makeRound(level: number, seed: string, mode: CountMode = 'normal'): Round {
  const rng = mulberry32((hash(seed) + level * 2654435761) >>> 0)
  const count = countForLevel(level)
  const size = gridSizeForCount(count)
  const cols = size
  const rows = size

  const inBounds = (x: number, y: number): boolean => x >= 0 && x < cols && y >= 0 && y < rows

  // Grow a connected blob outward from the center by repeatedly filling a
  // random empty cell adjacent to the cluster.
  const filled = new Set<string>()
  const order: Array<[number, number]> = []
  const add = (x: number, y: number): void => {
    filled.add(key(x, y))
    order.push([x, y])
  }
  add(Math.floor(cols / 2), Math.floor(rows / 2))

  while (order.length < count) {
    const frontier: Array<[number, number]> = []
    for (const [fx, fy] of order) {
      for (const [nx, ny] of neighbors(fx, fy)) {
        if (inBounds(nx, ny) && !filled.has(key(nx, ny))) frontier.push([nx, ny])
      }
    }
    if (frontier.length === 0) break
    const [gx, gy] = frontier[Math.floor(rng() * frontier.length)]
    add(gx, gy)
  }

  const cells: Cell[] = order.map(([x, y]) => ({
    x,
    y,
    color: PALETTE[Math.floor(rng() * PALETTE.length)],
  }))

  return {
    level,
    mode,
    cells,
    cols,
    rows,
    exposureMs: exposureForLevel(level, mode),
    blockCount: cells.length,
  }
}

/** The correct answer for a round: the number of blocks the player can see. */
export function correctAnswer(round: Round): number {
  return round.blockCount
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
