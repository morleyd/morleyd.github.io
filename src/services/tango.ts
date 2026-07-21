/**
 * Tango engine — a 6×6 binary-logic puzzle (LinkedIn-style). Each cell is a Sun
 * (0) or Moon (1). A full board is valid when:
 *   - every row and every column has exactly three of each symbol,
 *   - no three of the same symbol are adjacent (horizontally or vertically),
 *   - all "=" (equal) and "×" (opposite) edge constraints between neighbors hold.
 *
 * Puzzles are generated from a seed by building a valid full board, adding a
 * minimal set of clues + constraints, and verifying a unique solution.
 */

import { rngFromSeed } from './seed'

export const SIZE = 6
export const HALF = SIZE / 2
export const CELLS = SIZE * SIZE

export const SUN = 0
export const MOON = 1
export const EMPTY = -1

export type Cell = -1 | 0 | 1
export type Grid = Cell[]

/** A constraint between two orthogonally adjacent cells. */
export interface Constraint {
  a: number // cell index
  b: number // neighbor index (b === a+1 for horizontal, a+SIZE for vertical)
  kind: 'eq' | 'opp'
}

export interface Puzzle {
  given: Grid // clues shown (-1 = blank)
  solution: Grid // the unique full solution (0/1)
  constraints: Constraint[]
  seed: string
}

const rc = (i: number): [number, number] => [Math.floor(i / SIZE), i % SIZE]

/** Values already three-of-a-kind or three-in-a-row would break — used by the solver. */
function violates(grid: Grid, i: number, val: Cell, constraints: Map<string, 'eq' | 'opp'>): boolean {
  const [r, c] = rc(i)

  // Count in row/column must not exceed HALF for either symbol.
  let rowCount = 0
  let colCount = 0
  let rowFilled = 0
  let colFilled = 0
  for (let k = 0; k < SIZE; k += 1) {
    const rv = k === c ? val : grid[r * SIZE + k]
    const cv = k === r ? val : grid[k * SIZE + c]
    if (rv !== EMPTY) {
      rowFilled += 1
      if (rv === val) rowCount += 1
    }
    if (cv !== EMPTY) {
      colFilled += 1
      if (cv === val) colCount += 1
    }
  }
  if (rowCount > HALF || colCount > HALF) return true
  // If the line is full it must be balanced (exactly HALF each).
  if (rowFilled === SIZE && rowCount !== HALF) return true
  if (colFilled === SIZE && colCount !== HALF) return true

  // No three consecutive equal symbols, horizontally or vertically.
  const at = (rr: number, cc: number): Cell => {
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return EMPTY
    if (rr === r && cc === c) return val
    return grid[rr * SIZE + cc]
  }
  const triples: Array<[number, number][]> = [
    [[r, c - 2], [r, c - 1], [r, c]],
    [[r, c - 1], [r, c], [r, c + 1]],
    [[r, c], [r, c + 1], [r, c + 2]],
    [[r - 2, c], [r - 1, c], [r, c]],
    [[r - 1, c], [r, c], [r + 1, c]],
    [[r, c], [r + 1, c], [r + 2, c]],
  ]
  for (const t of triples) {
    if (t.every(([rr, cc]) => at(rr, cc) === val)) return true
  }

  // Edge constraints touching this cell.
  const neighbors = [i - 1, i + 1, i - SIZE, i + SIZE]
  for (const n of neighbors) {
    if (n < 0 || n >= CELLS) continue
    // Skip horizontal wrap-around.
    if ((n === i - 1 || n === i + 1) && Math.floor(n / SIZE) !== r) continue
    const key = edgeKey(i, n)
    const kind = constraints.get(key)
    if (kind === undefined) continue
    const nv = grid[n]
    if (nv === EMPTY) continue
    if (kind === 'eq' && nv !== val) return true
    if (kind === 'opp' && nv === val) return true
  }
  return false
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`)

const constraintMap = (constraints: Constraint[]): Map<string, 'eq' | 'opp'> => {
  const m = new Map<string, 'eq' | 'opp'>()
  for (const c of constraints) m.set(edgeKey(c.a, c.b), c.kind)
  return m
}

/**
 * Count solutions (up to `limit`) consistent with the givens and constraints.
 * Fills cells in order, pruning with `violates`.
 */
export function countSolutions(given: Grid, constraints: Constraint[], limit = 2): number {
  const map = constraintMap(constraints)
  const work = given.slice()
  let count = 0

  const recurse = (pos: number): void => {
    if (count >= limit) return
    if (pos === CELLS) {
      count += 1
      return
    }
    if (work[pos] !== EMPTY) {
      recurse(pos + 1)
      return
    }
    for (const val of [SUN, MOON] as Cell[]) {
      if (!violates(work, pos, val, map)) {
        work[pos] = val
        recurse(pos + 1)
        work[pos] = EMPTY
        if (count >= limit) return
      }
    }
  }

  recurse(0)
  return count
}

/** Solve givens+constraints; returns the completed grid or null. */
export function solve(given: Grid, constraints: Constraint[]): Grid | null {
  const map = constraintMap(constraints)
  const work = given.slice()
  let result: Grid | null = null

  const recurse = (pos: number): boolean => {
    if (pos === CELLS) {
      result = work.slice()
      return true
    }
    if (work[pos] !== EMPTY) return recurse(pos + 1)
    for (const val of [SUN, MOON] as Cell[]) {
      if (!violates(work, pos, val, map)) {
        work[pos] = val
        if (recurse(pos + 1)) return true
        work[pos] = EMPTY
      }
    }
    return false
  }

  recurse(0)
  return result
}

/** Build a random valid full board using backtracking with a shuffled choice order. */
export function generateSolved(rng: () => number): Grid {
  const empty: Grid = new Array(CELLS).fill(EMPTY)
  const noConstraints = new Map<string, 'eq' | 'opp'>()
  const work = empty.slice()

  const recurse = (pos: number): boolean => {
    if (pos === CELLS) return true
    const order: Cell[] = rng() < 0.5 ? [SUN, MOON] : [MOON, SUN]
    for (const val of order) {
      if (!violates(work, pos, val, noConstraints)) {
        work[pos] = val
        if (recurse(pos + 1)) return true
        work[pos] = EMPTY
      }
    }
    return false
  }

  recurse(0)
  return work
}

/** All orthogonal adjacent edges of the board, as [a, b] with a < b. */
function allEdges(): Array<[number, number]> {
  const edges: Array<[number, number]> = []
  for (let i = 0; i < CELLS; i += 1) {
    const [r, c] = rc(i)
    if (c < SIZE - 1) edges.push([i, i + 1])
    if (r < SIZE - 1) edges.push([i, i + SIZE])
  }
  return edges
}

/**
 * Generate a uniquely-solvable puzzle. Strategy: from a full solution, seed a
 * handful of edge constraints (matching the solution), then add just enough cell
 * clues so the solution is unique, then trim clues that aren't needed.
 */
export function generateTango(seed: string): Puzzle {
  const rng = rngFromSeed(`tango:${seed}`)
  const solution = generateSolved(rng)

  // Pick a random subset of edges as constraints, typed to match the solution.
  const edges = allEdges()
  for (let i = edges.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[edges[i], edges[j]] = [edges[j], edges[i]]
  }
  const constraints: Constraint[] = edges.slice(0, 8).map(([a, b]) => ({
    a,
    b,
    kind: solution[a] === solution[b] ? 'eq' : 'opp',
  }))

  // Add clues (in random order) until the solution is unique.
  const order = Array.from({ length: CELLS }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const given: Grid = new Array(CELLS).fill(EMPTY)
  for (const idx of order) {
    if (countSolutions(given, constraints, 2) === 1) break
    given[idx] = solution[idx]
  }

  // Trim clues that are redundant (removing them keeps the solution unique).
  for (const idx of order) {
    if (given[idx] === EMPTY) continue
    const backup = given[idx]
    given[idx] = EMPTY
    if (countSolutions(given, constraints, 2) !== 1) given[idx] = backup
  }

  return { given, solution, constraints, seed }
}

/** Cells that break a rule given the current (possibly partial) grid. */
export function findConflicts(grid: Grid, constraints: Constraint[]): Set<number> {
  const conflicts = new Set<number>()

  // Three-in-a-row (any three consecutive equal, non-empty).
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const i = r * SIZE + c
      const v = grid[i]
      if (v === EMPTY) continue
      if (c <= SIZE - 3 && grid[i + 1] === v && grid[i + 2] === v) {
        conflicts.add(i).add(i + 1).add(i + 2)
      }
      if (r <= SIZE - 3 && grid[i + SIZE] === v && grid[i + 2 * SIZE] === v) {
        conflicts.add(i).add(i + SIZE).add(i + 2 * SIZE)
      }
    }
  }

  // Too many of one symbol in a full-ish line.
  for (let r = 0; r < SIZE; r += 1) {
    const suns: number[] = []
    const moons: number[] = []
    for (let c = 0; c < SIZE; c += 1) {
      const i = r * SIZE + c
      if (grid[i] === SUN) suns.push(i)
      else if (grid[i] === MOON) moons.push(i)
    }
    if (suns.length > HALF) suns.forEach((i) => conflicts.add(i))
    if (moons.length > HALF) moons.forEach((i) => conflicts.add(i))
  }
  for (let c = 0; c < SIZE; c += 1) {
    const suns: number[] = []
    const moons: number[] = []
    for (let r = 0; r < SIZE; r += 1) {
      const i = r * SIZE + c
      if (grid[i] === SUN) suns.push(i)
      else if (grid[i] === MOON) moons.push(i)
    }
    if (suns.length > HALF) suns.forEach((i) => conflicts.add(i))
    if (moons.length > HALF) moons.forEach((i) => conflicts.add(i))
  }

  // Violated edge constraints (both cells filled).
  for (const { a, b, kind } of constraints) {
    if (grid[a] === EMPTY || grid[b] === EMPTY) continue
    if (kind === 'eq' && grid[a] !== grid[b]) conflicts.add(a).add(b)
    if (kind === 'opp' && grid[a] === grid[b]) conflicts.add(a).add(b)
  }

  return conflicts
}

/** True when the grid is full, balanced, and rule-compliant. */
export function isSolved(grid: Grid, constraints: Constraint[]): boolean {
  return grid.every((v) => v !== EMPTY) && findConflicts(grid, constraints).size === 0
}
