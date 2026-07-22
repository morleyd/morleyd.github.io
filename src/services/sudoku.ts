/**
 * Sudoku engine — puzzle generation, solving, and validation. Pure and
 * deterministic: pass a seeded RNG to get the same puzzle from a share code.
 *
 * A grid is a flat length-81 array of 0..9 (0 = blank). Cell index = row*9 + col.
 */

import { rngFromSeed } from './seed'

export const N = 9
export const CELLS = N * N

export type Grid = number[]
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

/** Target number of givens (clues) per difficulty. Fewer clues = harder. */
const CLUES: Record<Difficulty, number> = {
  easy: 40,
  medium: 33,
  hard: 28,
  expert: 24,
}

const boxStart = (i: number): number => {
  const r = Math.floor(i / N)
  const c = i % N
  return Math.floor(r / 3) * 3 * N + Math.floor(c / 3) * 3
}

// --- Fast constraint core (bitmasks per row/column/box) ------------------
// Solving and generation run this hot path thousands of times during
// uniqueness checks, so candidates are tracked as 9-bit masks and updated
// incrementally instead of rescanning 27 cells per cell per node.

const FULL = 0x1ff // bits 0..8 set → digits 1..9 available
const boxOf = (r: number, c: number): number => Math.floor(r / 3) * 3 + Math.floor(c / 3)
const digitOf = (bit: number): number => 32 - Math.clz32(bit) // 1<<(v-1) → v
const popcount = (x: number): number => {
  let n = 0
  let v = x
  while (v) {
    v &= v - 1
    n += 1
  }
  return n
}

interface Masks {
  row: Int16Array
  col: Int16Array
  box: Int16Array
}

/** Build per-unit masks, or null if the givens already contain a duplicate. */
function buildMasks(grid: Grid): Masks | null {
  const row = new Int16Array(N)
  const col = new Int16Array(N)
  const box = new Int16Array(N)
  for (let i = 0; i < CELLS; i += 1) {
    const v = grid[i]
    if (!v) continue
    const r = (i / N) | 0
    const c = i % N
    const b = boxOf(r, c)
    const bit = 1 << (v - 1)
    if (row[r] & bit || col[c] & bit || box[b] & bit) return null
    row[r] |= bit
    col[c] |= bit
    box[b] |= bit
  }
  return { row, col, box }
}

/** Index + candidate mask of the empty cell with the fewest candidates. */
function mostConstrained(grid: Grid, m: Masks): { cell: number; mask: number } {
  let cell = -1
  let mask = 0
  let fewest = N + 1
  for (let i = 0; i < CELLS; i += 1) {
    if (grid[i]) continue
    const r = (i / N) | 0
    const c = i % N
    const avail = FULL & ~(m.row[r] | m.col[c] | m.box[boxOf(r, c)])
    const count = popcount(avail)
    if (count < fewest) {
      fewest = count
      cell = i
      mask = avail
      if (count <= 1) break // 0 = dead end, 1 = forced — can't do better
    }
  }
  return { cell, mask }
}

/** Values already used in the row, column, and box of cell `i`. */
export function usedValues(grid: Grid, i: number): Set<number> {
  const r = Math.floor(i / N)
  const c = i % N
  const used = new Set<number>()
  for (let k = 0; k < N; k += 1) {
    used.add(grid[r * N + k])
    used.add(grid[k * N + c])
  }
  const bs = boxStart(i)
  for (let dr = 0; dr < 3; dr += 1) {
    for (let dc = 0; dc < 3; dc += 1) used.add(grid[bs + dr * N + dc])
  }
  used.delete(0)
  return used
}

/** Whether placing `val` at `i` is legal given the current grid. */
export function isValidPlacement(grid: Grid, i: number, val: number): boolean {
  return !usedValues(grid, i).has(val)
}

const shuffled = (rng: () => number): number[] => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Count solutions up to `limit` via backtracking on the most-constrained cell.
 * Returns as soon as `limit` is reached, so uniqueness checks stay cheap.
 */
export function countSolutions(grid: Grid, limit = 2): number {
  const work = grid.slice()
  const m = buildMasks(work)
  if (!m) return 0 // givens already conflict → unsolvable
  let count = 0

  const recurse = (): void => {
    const { cell, mask } = mostConstrained(work, m)
    if (cell === -1) {
      count += 1 // no empty cells → a complete solution
      return
    }
    if (mask === 0) return // dead end
    const r = (cell / N) | 0
    const c = cell % N
    const b = boxOf(r, c)
    let bits = mask
    while (bits) {
      const bit = bits & -bits
      bits -= bit
      work[cell] = digitOf(bit)
      m.row[r] |= bit
      m.col[c] |= bit
      m.box[b] |= bit
      recurse()
      m.row[r] &= ~bit
      m.col[c] &= ~bit
      m.box[b] &= ~bit
      work[cell] = 0
      if (count >= limit) return
    }
  }

  recurse()
  return count
}

/** Solve a grid; returns a solved copy or null if unsolvable. */
export function solve(grid: Grid): Grid | null {
  const work = grid.slice()
  const m = buildMasks(work)
  if (!m) return null

  const recurse = (): boolean => {
    const { cell, mask } = mostConstrained(work, m)
    if (cell === -1) return true
    if (mask === 0) return false
    const r = (cell / N) | 0
    const c = cell % N
    const b = boxOf(r, c)
    let bits = mask
    while (bits) {
      const bit = bits & -bits
      bits -= bit
      work[cell] = digitOf(bit)
      m.row[r] |= bit
      m.col[c] |= bit
      m.box[b] |= bit
      if (recurse()) return true
      m.row[r] &= ~bit
      m.col[c] &= ~bit
      m.box[b] &= ~bit
      work[cell] = 0
    }
    return false
  }

  return recurse() ? work : null
}

/** Build a full, valid solution grid using randomized backtracking. */
export function generateSolved(rng: () => number): Grid {
  const grid: Grid = new Array(CELLS).fill(0)
  const row = new Int16Array(N)
  const col = new Int16Array(N)
  const box = new Int16Array(N)

  const fill = (pos: number): boolean => {
    if (pos === CELLS) return true
    const r = (pos / N) | 0
    const c = pos % N
    const b = boxOf(r, c)
    const avail = FULL & ~(row[r] | col[c] | box[b])
    for (const v of shuffled(rng)) {
      const bit = 1 << (v - 1)
      if (!(avail & bit)) continue
      grid[pos] = v
      row[r] |= bit
      col[c] |= bit
      box[b] |= bit
      if (fill(pos + 1)) return true
      grid[pos] = 0
      row[r] &= ~bit
      col[c] &= ~bit
      box[b] &= ~bit
    }
    return false
  }

  fill(0)
  return grid
}

export interface Puzzle {
  puzzle: Grid // the clues shown to the player (0 = blank)
  solution: Grid // the unique completed grid
  given: boolean[] // which cells are fixed clues
  difficulty: Difficulty
  seed: string
}

/**
 * Generate a puzzle with a unique solution by digging cells out of a full grid.
 * Cells are removed in a seeded random order and only kept removed if the
 * puzzle still has exactly one solution, so the result is always solvable by
 * logic (no guessing needed to stay unique).
 */
export function generatePuzzle(difficulty: Difficulty, seed: string): Puzzle {
  const rng = rngFromSeed(`${difficulty}:${seed}`)
  const solution = generateSolved(rng)
  const puzzle = solution.slice()

  const order = Array.from({ length: CELLS }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const targetGivens = CLUES[difficulty]
  let givens = CELLS
  for (const idx of order) {
    if (givens <= targetGivens) break
    const backup = puzzle[idx]
    if (backup === 0) continue
    puzzle[idx] = 0
    // Keep the dig only if the solution is still unique.
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[idx] = backup
    } else {
      givens -= 1
    }
  }

  return {
    puzzle,
    solution,
    given: puzzle.map((v) => v !== 0),
    difficulty,
    seed,
  }
}

/** Cell indices that conflict with another filled cell (share a unit + value). */
export function findConflicts(grid: Grid): Set<number> {
  const conflicts = new Set<number>()
  for (let i = 0; i < CELLS; i += 1) {
    const v = grid[i]
    if (v === 0) continue
    const r = Math.floor(i / N)
    const c = i % N
    const bs = boxStart(i)
    const peers: number[] = []
    for (let k = 0; k < N; k += 1) {
      if (k !== c) peers.push(r * N + k)
      if (k !== r) peers.push(k * N + c)
    }
    for (let dr = 0; dr < 3; dr += 1) {
      for (let dc = 0; dc < 3; dc += 1) {
        const p = bs + dr * N + dc
        if (p !== i) peers.push(p)
      }
    }
    if (peers.some((p) => grid[p] === v)) conflicts.add(i)
  }
  return conflicts
}

/** True when every cell is filled and there are no conflicts. */
export function isComplete(grid: Grid): boolean {
  return grid.every((v) => v !== 0) && findConflicts(grid).size === 0
}

/** Outcome of tapping a cell while a digit is "locked" on the number pad. */
export interface LockPlacement {
  grid: Grid // a new grid with the change applied
  cleared: boolean // the tap REMOVED the locked digit (toggle-delete)
}

/**
 * Apply a locked-digit tap to cell `i`. If the cell already holds `digit` (and
 * isn't a given) the digit is toggled OFF — the natural way to clear it — and
 * `cleared` is true; otherwise the digit is placed and `cleared` is false. The
 * caller uses `cleared` to know NOT to advance the lock on a delete. Givens are
 * left untouched.
 */
export function placeLockedDigit(
  cells: Grid,
  given: boolean[],
  i: number,
  digit: number,
): LockPlacement {
  const grid = cells.slice()
  if (given[i]) return { grid, cleared: false }
  if (grid[i] === digit) {
    grid[i] = 0
    return { grid, cleared: true }
  }
  grid[i] = digit
  return { grid, cleared: false }
}

/** Clear cell `i` (erase). Returns a new grid; givens are left untouched. */
export function clearCell(cells: Grid, given: boolean[], i: number): Grid {
  const grid = cells.slice()
  if (!given[i]) grid[i] = 0
  return grid
}
