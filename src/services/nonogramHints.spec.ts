import { describe, it, expect } from 'vitest'
import { findHint } from './nonogramHints'
import type { Nonogram, Solution } from './nonogram'

const T = true
const F = false
const make = (
  rows: number,
  cols: number,
  solution: Solution,
  rowClues: number[][],
  colClues: number[][],
): Nonogram => ({ rows, cols, solution, rowClues, colClues, seed: 't' })

// 3×3:  # . #  /  # # .  /  . . #
const P3 = make(
  3,
  3,
  [T, F, T, T, T, F, F, F, T],
  [[1, 1], [2], [1]],
  [[2], [1], [1, 1]],
)

// 2×2 diagonal — every line is a lone [1], so no overlap exists anywhere.
const DIAG = make(2, 2, [T, F, F, T], [[1], [1]], [[1], [1]])

// 2×2 with an empty top row.
const TOP_EMPTY = make(2, 2, [F, F, T, T], [[0], [2]], [[1], [1]])

describe('findHint', () => {
  it('flags a mistake before anything else, pinpointing the square', () => {
    // Cell 1 is filled but empty in the picture — a slip that blocks progress.
    const h = findHint([0, 1, 0, 0, 0, 0, 0, 0, 0], P3)
    expect(h).toMatchObject({ kind: 'mistake', cell: 1, apply: 0 })
  })

  it('flags a wrong X-mark as a mistake too', () => {
    // Cell 0 X-marked, but the picture fills it.
    const h = findHint([2, 0, 0, 0, 0, 0, 0, 0, 0], P3)
    expect(h).toMatchObject({ kind: 'mistake', cell: 0, apply: 0 })
  })

  it('surfaces a pure overlap deduction on a blank board', () => {
    // Row 1 is [1,1] in a width-3 line — only one packing, so cell 0 is forced.
    const h = findHint(new Array(9).fill(0), P3)
    expect(h).toMatchObject({ kind: 'overlap', cell: 0, apply: 1 })
  })

  it('forces empties (X-marks) from a 0-clue line via overlap', () => {
    const h = findHint([0, 0, 0, 0], TOP_EMPTY)
    expect(h).toMatchObject({ kind: 'overlap', cell: 0, apply: 2 })
  })

  it('falls back to cross-reference when no overlap is available', () => {
    // Diagonal has no overlap; with cell 0 filled, row 1 forces cell 1 empty.
    const h = findHint([1, 0, 0, 0], DIAG)
    expect(h).toMatchObject({ kind: 'cross-reference', cell: 1, apply: 2 })
  })

  it('reveals a true cell when no single-line deduction exists', () => {
    // Blank diagonal: nothing is forced by one line, so reveal cell 0 (filled).
    const h = findHint([0, 0, 0, 0], DIAG)
    expect(h).toMatchObject({ kind: 'reveal', cell: 0, apply: 1 })
  })

  it('returns null once every square is decided (fills + X-marks)', () => {
    // Fills where the picture is filled, X everywhere else — nothing left to nudge.
    const marks = [T, F, T, T, T, F, F, F, T].map((v) => (v ? 1 : 2))
    expect(findHint(marks, P3)).toBeNull()
  })
})
