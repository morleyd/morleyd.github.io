/**
 * Human-strategy Sudoku solver used to power progressive hints.
 *
 * Unlike the backtracking solver in ./sudoku (which just brute-forces the
 * answer), this module finds the *next logically-forced move* the way a person
 * would — by name — so a hint can nudge the player instead of spoiling the
 * cell. Techniques, easiest first:
 *
 *   1. Naked single    — a cell with only one remaining candidate.
 *   2. Hidden single    — a digit that fits only one cell of a unit.
 *   3. Locked candidate — pointing / claiming (candidate confined to a line
 *                         within a box, or a box within a line → eliminations).
 *   4. Naked pair       — two cells sharing the same two candidates.
 *   5. Hidden pair      — two digits confined to the same two cells.
 *
 * Candidates are derived purely from the placed digits and the Sudoku
 * constraints, independent of the player's pencil notes, so a hint reflects the
 * true logical state of the board.
 */

import { CELLS, N, type Grid } from './sudoku'

const FULL = 0x1ff // bits 0..8 set → digits 1..9 available
const boxOf = (r: number, c: number): number => Math.floor(r / 3) * 3 + Math.floor(c / 3)
const rowOf = (i: number): number => Math.floor(i / N)
const colOf = (i: number): number => i % N

/** Digits (1..9) present in a 9-bit candidate mask, ascending. */
export function digitsOf(mask: number): number[] {
  const out: number[] = []
  for (let v = 1; v <= N; v += 1) {
    if (mask & (1 << (v - 1))) out.push(v)
  }
  return out
}

const popcount = (mask: number): number => digitsOf(mask).length

/**
 * Candidate bitmask for every cell (0 for already-filled cells). A set bit
 * `1 << (v-1)` means digit `v` is still legal there.
 */
export function computeCandidates(grid: Grid): number[] {
  const row = new Array<number>(N).fill(0)
  const col = new Array<number>(N).fill(0)
  const box = new Array<number>(N).fill(0)
  for (let i = 0; i < CELLS; i += 1) {
    const v = grid[i]
    if (!v) continue
    const bit = 1 << (v - 1)
    row[rowOf(i)] |= bit
    col[colOf(i)] |= bit
    box[boxOf(rowOf(i), colOf(i))] |= bit
  }
  const cand = new Array<number>(CELLS).fill(0)
  for (let i = 0; i < CELLS; i += 1) {
    if (grid[i]) continue
    cand[i] = FULL & ~(row[rowOf(i)] | col[colOf(i)] | box[boxOf(rowOf(i), colOf(i))])
  }
  return cand
}

// --- Unit geometry (rows, columns, boxes as lists of cell indices) --------

export type UnitType = 'row' | 'column' | 'box'
export interface HintUnit {
  type: UnitType
  index: number // 0-based
}

const ROWS: number[][] = []
const COLS: number[][] = []
const BOXES: number[][] = []
for (let u = 0; u < N; u += 1) {
  const rowCells: number[] = []
  const colCells: number[] = []
  const boxCells: number[] = []
  const br = Math.floor(u / 3) * 3
  const bc = (u % 3) * 3
  for (let k = 0; k < N; k += 1) {
    rowCells.push(u * N + k)
    colCells.push(k * N + u)
    boxCells.push((br + Math.floor(k / 3)) * N + (bc + (k % 3)))
  }
  ROWS.push(rowCells)
  COLS.push(colCells)
  BOXES.push(boxCells)
}

const unitCells = (unit: HintUnit): number[] =>
  unit.type === 'row' ? ROWS[unit.index] : unit.type === 'column' ? COLS[unit.index] : BOXES[unit.index]

const cellLabel = (i: number): string => `row ${rowOf(i) + 1}, column ${colOf(i) + 1}`
const unitLabel = (unit: HintUnit): string => `${unit.type} ${unit.index + 1}`

// --- Structured hint ------------------------------------------------------

export type HintTechnique =
  | 'naked-single'
  | 'hidden-single'
  | 'pointing'
  | 'claiming'
  | 'naked-pair'
  | 'hidden-pair'

export interface Elimination {
  cell: number
  value: number
}

export interface Hint {
  technique: HintTechnique
  label: string // human-readable technique name
  unit: HintUnit
  digits: number[] // digits the technique is about ("look at the 7s")
  cells: number[] // defining cells to highlight at the "exact cell" step
  /** A single forced placement, when the technique yields one (singles). */
  placement: { cell: number; value: number } | null
  /** Candidate removals, when the technique is an elimination one. */
  eliminations: Elimination[]
  /**
   * Progressively more specific nudges. Step through them one per hint press;
   * the FINAL entry reveals the value / elimination. Always at least 1 entry.
   */
  levels: string[]
}

// --- Techniques -----------------------------------------------------------

export function findNakedSingle(cand: number[]): Hint | null {
  for (let i = 0; i < CELLS; i += 1) {
    if (cand[i] && popcount(cand[i]) === 1) {
      const value = digitsOf(cand[i])[0]
      const unit: HintUnit = { type: 'box', index: boxOf(rowOf(i), colOf(i)) }
      return {
        technique: 'naked-single',
        label: 'Naked single',
        unit,
        digits: [value],
        cells: [i],
        placement: { cell: i, value },
        eliminations: [],
        levels: [
          `Naked single: one empty cell in ${unitLabel(unit)} has just a single candidate left.`,
          `Look in ${unitLabel(unit)}, row ${rowOf(i) + 1}.`,
          `The cell at ${cellLabel(i)} is the one — every other digit is eliminated there.`,
          `It can only be ${value}.`,
        ],
      }
    }
  }
  return null
}

export function findHiddenSingle(cand: number[]): Hint | null {
  const units: HintUnit[] = []
  for (let u = 0; u < N; u += 1) {
    units.push({ type: 'row', index: u }, { type: 'column', index: u }, { type: 'box', index: u })
  }
  for (const unit of units) {
    const cells = unitCells(unit)
    for (let v = 1; v <= N; v += 1) {
      const bit = 1 << (v - 1)
      const spots = cells.filter((i) => cand[i] & bit)
      if (spots.length !== 1) continue
      const cell = spots[0]
      // Skip when it's really a naked single (reported by the easier technique).
      if (popcount(cand[cell]) === 1) continue
      return {
        technique: 'hidden-single',
        label: 'Hidden single',
        unit,
        digits: [v],
        cells: [cell],
        placement: { cell, value: v },
        eliminations: [],
        levels: [
          `Hidden single: in ${unitLabel(unit)}, one digit fits in only a single cell.`,
          `Look at the ${v}s.`,
          `In ${unitLabel(unit)}, ${v} can go only in the cell at ${cellLabel(cell)}.`,
          `Place ${v} there.`,
        ],
      }
    }
  }
  return null
}

/** Pointing: a digit's candidates in a box share one line → clear that line. */
export function findPointing(cand: number[]): Hint | null {
  for (let b = 0; b < N; b += 1) {
    const cells = BOXES[b]
    for (let v = 1; v <= N; v += 1) {
      const bit = 1 << (v - 1)
      const spots = cells.filter((i) => cand[i] & bit)
      if (spots.length < 2) continue
      const rows = new Set(spots.map(rowOf))
      const cols = new Set(spots.map(colOf))
      let line: HintUnit | null = null
      if (rows.size === 1) line = { type: 'row', index: rowOf(spots[0]) }
      else if (cols.size === 1) line = { type: 'column', index: colOf(spots[0]) }
      if (!line) continue
      const eliminations = unitCells(line)
        .filter((i) => !cells.includes(i) && cand[i] & bit)
        .map((cell) => ({ cell, value: v }))
      if (!eliminations.length) continue
      const unit: HintUnit = { type: 'box', index: b }
      return {
        technique: 'pointing',
        label: 'Locked candidate (pointing)',
        unit,
        digits: [v],
        cells: spots,
        placement: null,
        eliminations,
        levels: [
          `Locked candidate (pointing) in ${unitLabel(unit)}.`,
          `Look at the ${v}s in ${unitLabel(unit)}.`,
          `Every spot for ${v} in ${unitLabel(unit)} lies in ${unitLabel(line)}.`,
          `So ${v} can't appear elsewhere in ${unitLabel(line)} — remove it from ${eliminations.length} cell(s).`,
        ],
      }
    }
  }
  return null
}

/** Claiming: a digit's candidates in a line share one box → clear that box. */
export function findClaiming(cand: number[]): Hint | null {
  const lines: HintUnit[] = []
  for (let u = 0; u < N; u += 1) lines.push({ type: 'row', index: u }, { type: 'column', index: u })
  for (const line of lines) {
    const cells = unitCells(line)
    for (let v = 1; v <= N; v += 1) {
      const bit = 1 << (v - 1)
      const spots = cells.filter((i) => cand[i] & bit)
      if (spots.length < 2) continue
      const boxes = new Set(spots.map((i) => boxOf(rowOf(i), colOf(i))))
      if (boxes.size !== 1) continue
      const b = boxes.values().next().value as number
      const eliminations = BOXES[b]
        .filter((i) => !cells.includes(i) && cand[i] & bit)
        .map((cell) => ({ cell, value: v }))
      if (!eliminations.length) continue
      const boxUnit: HintUnit = { type: 'box', index: b }
      return {
        technique: 'claiming',
        label: 'Locked candidate (claiming)',
        unit: line,
        digits: [v],
        cells: spots,
        placement: null,
        eliminations,
        levels: [
          `Locked candidate (claiming) in ${unitLabel(line)}.`,
          `Look at the ${v}s in ${unitLabel(line)}.`,
          `All spots for ${v} in ${unitLabel(line)} fall inside ${unitLabel(boxUnit)}.`,
          `So ${v} can't appear elsewhere in ${unitLabel(boxUnit)} — remove it from ${eliminations.length} cell(s).`,
        ],
      }
    }
  }
  return null
}

function allUnits(): HintUnit[] {
  const units: HintUnit[] = []
  for (let u = 0; u < N; u += 1) {
    units.push({ type: 'row', index: u }, { type: 'column', index: u }, { type: 'box', index: u })
  }
  return units
}

export function findNakedPair(cand: number[]): Hint | null {
  for (const unit of allUnits()) {
    const cells = unitCells(unit)
    const pairCells = cells.filter((i) => cand[i] && popcount(cand[i]) === 2)
    for (let a = 0; a < pairCells.length; a += 1) {
      for (let b = a + 1; b < pairCells.length; b += 1) {
        if (cand[pairCells[a]] !== cand[pairCells[b]]) continue
        const mask = cand[pairCells[a]]
        const pair = [pairCells[a], pairCells[b]]
        const digits = digitsOf(mask)
        const eliminations: Elimination[] = []
        for (const i of cells) {
          if (pair.includes(i)) continue
          for (const v of digits) {
            if (cand[i] & (1 << (v - 1))) eliminations.push({ cell: i, value: v })
          }
        }
        if (!eliminations.length) continue
        return {
          technique: 'naked-pair',
          label: 'Naked pair',
          unit,
          digits,
          cells: pair,
          placement: null,
          eliminations,
          levels: [
            `Naked pair in ${unitLabel(unit)}.`,
            `Two cells there share only the candidates ${digits[0]} and ${digits[1]}.`,
            `Those cells are ${cellLabel(pair[0])} and ${cellLabel(pair[1])} — locking up ${digits.join(' & ')}.`,
            `So remove ${digits.join(' & ')} from the other ${eliminations.length} candidate(s) in ${unitLabel(unit)}.`,
          ],
        }
      }
    }
  }
  return null
}

export function findHiddenPair(cand: number[]): Hint | null {
  for (const unit of allUnits()) {
    const cells = unitCells(unit)
    // For each digit, which cells of this unit can hold it.
    const spotsFor: Record<number, number[]> = {}
    for (let v = 1; v <= N; v += 1) {
      spotsFor[v] = cells.filter((i) => cand[i] & (1 << (v - 1)))
    }
    for (let a = 1; a <= N; a += 1) {
      if (spotsFor[a].length !== 2) continue
      for (let b = a + 1; b <= N; b += 1) {
        if (spotsFor[b].length !== 2) continue
        const [a0, a1] = spotsFor[a]
        const [b0, b1] = spotsFor[b]
        if (a0 !== b0 || a1 !== b1) continue // must be the same two cells
        const pair = [a0, a1]
        const pairMask = (1 << (a - 1)) | (1 << (b - 1))
        const eliminations: Elimination[] = []
        for (const i of pair) {
          for (const v of digitsOf(cand[i] & ~pairMask)) eliminations.push({ cell: i, value: v })
        }
        if (!eliminations.length) continue
        return {
          technique: 'hidden-pair',
          label: 'Hidden pair',
          unit,
          digits: [a, b],
          cells: pair,
          placement: null,
          eliminations,
          levels: [
            `Hidden pair in ${unitLabel(unit)}.`,
            `Look at the ${a}s and ${b}s.`,
            `Only two cells in ${unitLabel(unit)} can hold ${a} or ${b}: ${cellLabel(pair[0])} and ${cellLabel(pair[1])}.`,
            `So those cells are just ${a}/${b} — remove the other ${eliminations.length} candidate(s) from them.`,
          ],
        }
      }
    }
  }
  return null
}

/**
 * Find the easiest logically-forced hint for the current board, or null when no
 * supported technique applies (e.g. the position needs guessing or is solved).
 */
export function findHint(grid: Grid): Hint | null {
  const cand = computeCandidates(grid)
  const finders = [
    findNakedSingle,
    findHiddenSingle,
    findPointing,
    findClaiming,
    findNakedPair,
    findHiddenPair,
  ]
  for (const finder of finders) {
    const hint = finder(cand)
    if (hint) return hint
  }
  return null
}
