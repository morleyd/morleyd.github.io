/**
 * Nonogram hint engine — pure, deterministic. Given the player's current marks
 * and the puzzle, it finds the single most useful next nudge and explains it,
 * without handing over the whole board. The view reveals it progressively
 * (spotlight the line → pinpoint the square → say what to do), so a `Hint`
 * carries the target cell, the line to spotlight, the mark to apply on the final
 * reveal, and two plain-language strings.
 *
 * Priority, matching how a stuck player is actually best helped:
 *   1. mistake        — a filled/crossed square that contradicts the picture.
 *                       Surfaced first: an error blocks all correct progress, and
 *                       today's line-level Check can't point at the exact square.
 *   2. overlap        — a square the line's clue settles on its own (the classic
 *                       "runs overlap in the middle" deduction), needing no marks.
 *   3. cross-reference — a square settled by the clue together with squares the
 *                       player has already placed.
 *   4. reveal          — last resort: no single-line step exists from here (the
 *                        puzzle may need cross-line work), so reveal one true cell.
 */

import { forcedCells, type Cell, type Nonogram } from './nonogram'

export type HintKind = 'mistake' | 'overlap' | 'cross-reference' | 'reveal'

export interface Hint {
  /** Row-major index of the square the hint is about. */
  cell: number
  /** The row or column to spotlight first (level 1), as cell indices. */
  region: number[]
  /** Which kind of nudge this is. */
  kind: HintKind
  /** The mark to set at `cell` on the final reveal: 0 clear · 1 fill · 2 X. */
  apply: Cell
  /** Level-1 explanation: names the technique and where to look, no square/value. */
  reason: string
  /** Level-3 explanation: what to actually do at the square. */
  reveal: string
}

/**
 * Find the next hint for the current board, or null when nothing is left to
 * settle (i.e. the puzzle is solved — the view guards on that before asking).
 */
export function findHint(marks: readonly number[], puzzle: Nonogram): Hint | null {
  const { rows, cols, solution, rowClues, colClues } = puzzle
  const rowLine = (r: number): number[] => Array.from({ length: cols }, (_, c) => r * cols + c)
  const colLine = (c: number): number[] => Array.from({ length: rows }, (_, r) => r * cols + c)

  // 1) Mistakes — a mark that can't be reconciled with the finished picture.
  for (let i = 0; i < marks.length; i += 1) {
    const wrongFill = marks[i] === 1 && !solution[i]
    const wrongCross = marks[i] === 2 && solution[i]
    if (!wrongFill && !wrongCross) continue
    const r = Math.floor(i / cols)
    return {
      cell: i,
      region: rowLine(r),
      kind: 'mistake',
      apply: 0,
      reason: wrongFill
        ? `There's a slip in row ${r + 1}: a filled square there isn't part of the picture.`
        : `There's a slip in row ${r + 1}: a square marked empty there is actually filled in the picture.`,
      reveal: wrongFill
        ? 'This square is empty in the solution — clear it.'
        : 'This square is filled in the solution — remove the X.',
    }
  }

  // 2 & 3) The next logically-forced square. Prefer a pure-overlap deduction
  // (readable from one clue alone) anywhere on the board; otherwise take the
  // first cross-reference (clue + existing marks).
  const lines = [
    ...rowClues.map((clue, r) => ({ idxs: rowLine(r), clue, label: `row ${r + 1}` })),
    ...colClues.map((clue, c) => ({ idxs: colLine(c), clue, label: `column ${c + 1}` })),
  ]
  let crossRef: Hint | null = null
  for (const { idxs, clue, label } of lines) {
    const cells = idxs.map((i) => marks[i] as Cell)
    const forced = forcedCells(cells, clue)
    if (!forced) continue // inconsistent, but any real mistake was already handled
    const blankForced = forcedCells(new Array(idxs.length).fill(0) as Cell[], clue)
    for (let k = 0; k < idxs.length; k += 1) {
      if (cells[k] !== 0) continue // the player has already decided this square
      const doFill = forced.fill[k]
      if (!doFill && !forced.empty[k]) continue
      const pureOverlap = Boolean(blankForced && (doFill ? blankForced.fill[k] : blankForced.empty[k]))
      const hint: Hint = {
        cell: idxs[k],
        region: idxs,
        kind: pureOverlap ? 'overlap' : 'cross-reference',
        apply: doFill ? 1 : 2,
        reason: pureOverlap
          ? `Look at ${label}: its clue alone settles one square, wherever the runs end up sliding.`
          : `Look at ${label}: its clue together with the squares you've already placed settles one more.`,
        reveal: doFill ? 'This square must be filled.' : 'This square must be empty — mark it with an X.',
      }
      if (pureOverlap) return hint // easiest technique to see — surface it now
      if (!crossRef) crossRef = hint // hold the first cross-reference as a fallback
    }
  }
  if (crossRef) return crossRef

  // 4) No single-line step available — reveal one true square to break the stall.
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i] !== 0) continue
    const r = Math.floor(i / cols)
    return {
      cell: i,
      region: rowLine(r),
      kind: 'reveal',
      apply: solution[i] ? 1 : 2,
      reason: `No single-line deduction is left from here — here's one square in row ${r + 1} to get things moving again.`,
      reveal: solution[i]
        ? 'In the solution this square is filled.'
        : 'In the solution this square is empty — mark it with an X.',
    }
  }
  return null
}
