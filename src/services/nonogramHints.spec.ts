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

// 3×3:  # . #  /  # # .  /  . . #   — row 1's [1,1] exactly fills 3 squares.
const P3 = make(3, 3, [T, F, T, T, T, F, F, F, T], [[1, 1], [2], [1]], [[2], [1], [1, 1]])

// 2×5: a run of 3 in row 1 overlaps itself; row 2 is empty.
const OVERLAP = make(
  2,
  5,
  [F, T, T, T, F, F, F, F, F, F],
  [[3], [0]],
  [[0], [1], [1], [1], [0]],
)

// 2×4: two rows of a completed run of 2, so their tails must be X.
const CAP = make(2, 4, [T, T, F, F, F, F, T, T], [[2], [2]], [[1], [1], [1], [1]])

// 2×3 with an all-empty middle column — nothing can ever fill it.
const REACH = make(2, 3, [T, F, F, F, F, T], [[1], [1]], [[1], [0], [1]])

// 2×2 diagonal — every line is a lone [1], so no single line settles anything.
const DIAG = make(2, 2, [T, F, F, T], [[1], [1]], [[1], [1]])

const nonEmpty = (s: string) => typeof s === 'string' && s.length > 0

describe('findHint', () => {
  it('flags a mistake first, on a line the mark makes impossible', () => {
    // Cell 1 filled, but row 1's [1,1] can't hold a filled middle square.
    const h = findHint([0, 1, 0, 0, 0, 0, 0, 0, 0], P3)!
    expect(h).toMatchObject({ kind: 'mistake', cell: 1, apply: 0 })
    expect(nonEmpty(h.nudge) && nonEmpty(h.lesson) && nonEmpty(h.reveal)).toBe(true)
  })

  it('flags a wrong X-mark as a mistake too', () => {
    const h = findHint([2, 0, 0, 0, 0, 0, 0, 0, 0], P3)!
    expect(h).toMatchObject({ kind: 'mistake', cell: 0, apply: 0 })
  })

  it('names a fully-determined line "complete" and shows its one arrangement', () => {
    const h = findHint(new Array(9).fill(0), P3)!
    expect(h).toMatchObject({ kind: 'complete', cell: 0, apply: 1 })
    expect(h.packing).toHaveLength(1)
  })

  it('uses overlap for a big run, with far-left/far-right/overlap strips', () => {
    const h = findHint(new Array(10).fill(0), OVERLAP)!
    expect(h).toMatchObject({ kind: 'overlap', cell: 2, apply: 1 })
    expect(h.packing).toHaveLength(3)
    // The overlap strip marks the middle square as the guaranteed one.
    expect(h.packing[2]).toContain('█')
  })

  it('caps a completed run with an explained X', () => {
    // Row 1 has its run of 2 filled at 0–1, so square 2 must be empty.
    const h = findHint([1, 1, 0, 0, 0, 0, 0, 0], CAP)!
    expect(h).toMatchObject({ kind: 'cap', cell: 2, apply: 2 })
    expect(h.lesson).toMatch(/run/i)
  })

  it('marks an unreachable square empty via "reach"', () => {
    const h = findHint(new Array(6).fill(0), REACH)!
    expect(h).toMatchObject({ kind: 'reach', cell: 1, apply: 2 })
    expect(h.packing).toHaveLength(2)
  })

  it('reveals a true square when no single-line step exists', () => {
    const h = findHint([0, 0, 0, 0], DIAG)!
    expect(h).toMatchObject({ kind: 'reveal', cell: 0, apply: 1 })
  })

  it('returns null once every square is decided', () => {
    const marks = [T, F, T, T, T, F, F, F, T].map((v) => (v ? 1 : 2))
    expect(findHint(marks, P3)).toBeNull()
  })

  it('prefers a satisfying fill over an X when both are available', () => {
    // OVERLAP's row 2 offers X-able empties, but the row-1 overlap fill wins.
    expect(findHint(new Array(10).fill(0), OVERLAP)!.apply).toBe(1)
  })
})
