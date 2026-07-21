/**
 * Tango hint engine — pure, deterministic deduction. Given the current (partial)
 * grid and its edge constraints, it finds the next cell whose value is *forced*
 * by a single logical rule, and explains why. No guessing or backtracking: only
 * the three techniques a human uses.
 *
 *   - triple  : the no-three-in-a-row rule. Two equal neighbours force the
 *               opposite on the cell beside them, and a cell sandwiched between
 *               two equals is forced to the opposite.
 *   - balance : once a row or column already holds its three of one symbol, every
 *               remaining empty cell in that line must be the other symbol.
 *   - link    : an "=" (equal) or "×" (opposite) badge propagates a known cell's
 *               value to its blank neighbour.
 *
 * The view reveals a hint progressively (region → cell → value), so a `Hint`
 * carries the target cell, the forced value, the supporting evidence cells, the
 * region to spotlight first, and a plain-language reason.
 */

import { EMPTY, HALF, MOON, SIZE, SUN, type Cell, type Constraint, type Grid } from './tango'

export type HintRule = 'triple' | 'balance' | 'link'

export interface Hint {
  /** The empty cell whose value is logically forced. */
  cell: number
  /** The value it must take (SUN or MOON). */
  value: Cell
  /** Which deduction rule forced it. */
  rule: HintRule
  /** The cells that provide the evidence (highlighted with the exact cell). */
  because: number[]
  /** Cells to spotlight first, before the exact cell is revealed. */
  region: number[]
  /** Plain-language explanation of the rule + region (no cell/value spoiler). */
  reason: string
}

const rc = (i: number): [number, number] => [Math.floor(i / SIZE), i % SIZE]
const idx = (r: number, c: number): number => r * SIZE + c
const opposite = (v: Cell): Cell => (v === SUN ? MOON : SUN)
const symbolName = (v: Cell): string => (v === SUN ? 'Sun' : 'Moon')

const rowLine = (r: number): number[] => Array.from({ length: SIZE }, (_, k) => idx(r, k))
const colLine = (c: number): number[] => Array.from({ length: SIZE }, (_, k) => idx(k, c))

/**
 * No-three-in-a-row deduction for a single empty cell. If two of its in-line
 * partners are equal and filled — sitting before it, after it, or straddling it —
 * then placing that symbol here would make three in a row, so the opposite is
 * forced.
 */
function tripleHint(grid: Grid, i: number): Hint | null {
  const [r, c] = rc(i)

  const check = (
    pairs: Array<[number, number]>,
    line: number[],
    axis: string,
    which: number,
  ): Hint | null => {
    for (const [p, q] of pairs) {
      if (grid[p] !== EMPTY && grid[p] === grid[q]) {
        const value = opposite(grid[p])
        return {
          cell: i,
          value,
          rule: 'triple',
          because: [p, q],
          region: line,
          reason: `No three in a row: ${axis} ${which} already has two ${symbolName(grid[p])}s in a line, so the next cell can't be a third.`,
        }
      }
    }
    return null
  }

  const hpairs: Array<[number, number]> = []
  if (c >= 2) hpairs.push([idx(r, c - 2), idx(r, c - 1)]) // pair sits before i
  if (c >= 1 && c <= SIZE - 2) hpairs.push([idx(r, c - 1), idx(r, c + 1)]) // i is sandwiched
  if (c <= SIZE - 3) hpairs.push([idx(r, c + 1), idx(r, c + 2)]) // pair sits after i
  const h = check(hpairs, rowLine(r), 'row', r + 1)
  if (h) return h

  const vpairs: Array<[number, number]> = []
  if (r >= 2) vpairs.push([idx(r - 2, c), idx(r - 1, c)])
  if (r >= 1 && r <= SIZE - 2) vpairs.push([idx(r - 1, c), idx(r + 1, c)])
  if (r <= SIZE - 3) vpairs.push([idx(r + 1, c), idx(r + 2, c)])
  return check(vpairs, colLine(c), 'column', c + 1)
}

/**
 * Balance deduction for a single empty cell: if its row or column already holds
 * HALF of one symbol, the cell must be the other symbol.
 */
function balanceHint(grid: Grid, i: number): Hint | null {
  const [r, c] = rc(i)

  const scan = (line: number[], axis: string, which: number): Hint | null => {
    const suns = line.filter((k) => grid[k] === SUN)
    const moons = line.filter((k) => grid[k] === MOON)
    if (suns.length === HALF) {
      return {
        cell: i,
        value: MOON,
        rule: 'balance',
        because: suns,
        region: line,
        reason: `Balance: ${axis} ${which} already has all ${HALF} of its Suns, so its empty cells must be Moons.`,
      }
    }
    if (moons.length === HALF) {
      return {
        cell: i,
        value: SUN,
        rule: 'balance',
        because: moons,
        region: line,
        reason: `Balance: ${axis} ${which} already has all ${HALF} of its Moons, so its empty cells must be Suns.`,
      }
    }
    return null
  }

  return scan(rowLine(r), 'row', r + 1) ?? scan(colLine(c), 'column', c + 1)
}

/**
 * Link deduction: for a constraint touching this empty cell whose other end is
 * filled, "=" copies that value and "×" flips it.
 */
function linkHint(
  grid: Grid,
  i: number,
  byCell: Map<number, Array<{ other: number; kind: 'eq' | 'opp' }>>,
): Hint | null {
  for (const { other, kind } of byCell.get(i) ?? []) {
    if (grid[other] === EMPTY) continue
    const known = grid[other] as Cell
    const value = kind === 'eq' ? known : opposite(known)
    return {
      cell: i,
      value,
      rule: 'link',
      because: [other],
      region: [other],
      reason:
        kind === 'eq'
          ? 'Equal (=) badge: this cell must match its highlighted neighbour.'
          : 'Opposite (×) badge: this cell must differ from its highlighted neighbour.',
    }
  }
  return null
}

/** Index constraints by each endpoint cell for quick lookup. */
function indexConstraints(
  constraints: Constraint[],
): Map<number, Array<{ other: number; kind: 'eq' | 'opp' }>> {
  const m = new Map<number, Array<{ other: number; kind: 'eq' | 'opp' }>>()
  const add = (cell: number, other: number, kind: 'eq' | 'opp') => {
    const list = m.get(cell) ?? []
    list.push({ other, kind })
    m.set(cell, list)
  }
  for (const { a, b, kind } of constraints) {
    add(a, b, kind)
    add(b, a, kind)
  }
  return m
}

/**
 * Find the next logically-forced cell in the current grid, or null if no single
 * rule settles a cell outright. Empty cells are scanned in reading order and, for
 * each, the triple → link → balance rules are tried; the first hit is returned.
 */
export function findHint(grid: Grid, constraints: Constraint[]): Hint | null {
  const byCell = indexConstraints(constraints)
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] !== EMPTY) continue
    const hit = tripleHint(grid, i) ?? linkHint(grid, i, byCell) ?? balanceHint(grid, i)
    if (hit) return hit
  }
  return null
}

export { symbolName }
