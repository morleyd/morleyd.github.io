/**
 * Nonogram hint engine — pure, deterministic, and built to TEACH, not just to
 * point. Given the player's marks and the puzzle it finds the single most
 * instructive next step, names the technique behind it, and explains the
 * reasoning with the line's real clue numbers (and, where it helps, a little
 * far-left / far-right packing diagram) so the player can learn to spot it
 * themselves. The view reveals it in three steps:
 *
 *   L1 `nudge`  — which line to look at and which idea applies (no square).
 *   L2 `lesson` — the worked reasoning + `packing` diagram, enough to find the
 *                 square yourself.
 *   L3 `reveal` — the exact square and what to do; the view applies it.
 *
 * Techniques, surfaced by how satisfying/teachable they are (fills first):
 *   complete — the clue exactly fills the line; there's only one arrangement.
 *   overlap  — a run long enough that it covers some squares no matter how it
 *              slides (the far-left ∩ far-right trick).
 *   cap      — a completed run must have a blank on each side.
 *   reach    — a square no run can cover in any arrangement, so it's blank.
 *   mistake  — a filled/emptied square that can't match the picture (shown first).
 *   reveal   — last resort: no single-line step exists, so reveal one true square.
 */

import { forcedCells, type Cell, type Nonogram } from './nonogram'

export type HintKind = 'mistake' | 'complete' | 'overlap' | 'cap' | 'reach' | 'reveal'

export interface Hint {
  /** Row-major index of the square the hint is about. */
  cell: number
  /** The row or column to spotlight (from L1), as cell indices. */
  region: number[]
  /** Which technique this is. */
  kind: HintKind
  /** Mark to set at `cell` on the final reveal: 0 clear · 1 fill · 2 X. */
  apply: Cell
  /** L1 — where to look and which idea, no square or value given away. */
  nudge: string
  /** L2 — the reasoning that lets the player find the square themselves. */
  lesson: string
  /** L2 — optional monospace diagram (far-left / far-right packings). */
  packing: string[]
  /** L3 — the exact square and what to do with it. */
  reveal: string
}

type State = -1 | 0 | 1 // solver view: unknown · known-empty · known-filled

const toRuns = (clue: number[]): number[] => (clue.length === 1 && clue[0] === 0 ? [] : clue)
const minSpan = (runs: number[]): number =>
  runs.reduce((a, b) => a + b, 0) + Math.max(0, runs.length - 1)

/**
 * The left-most valid arrangement of `runs` given the line's known cells, as the
 * start index of each run — or null if none fits. DFS placing each run at the
 * earliest feasible spot: run cells can't sit on a known-empty, the square after
 * a run must be a gap, and no known-filled square may be left uncovered.
 */
function leftmostStarts(state: State[], runs: number[]): number[] | null {
  const n = state.length
  const starts: number[] = []
  const dfs = (pos: number, ci: number): boolean => {
    if (ci === runs.length) {
      for (let k = pos; k < n; k += 1) if (state[k] === 1) return false // uncovered fill
      return true
    }
    const len = runs[ci]
    for (let start = pos; start + len <= n; start += 1) {
      let fits = true
      for (let k = start; k < start + len; k += 1) if (state[k] === 0) fits = false
      if (fits && start + len < n && state[start + len] === 1) fits = false // no gap after run
      let skippedFill = false
      for (let k = pos; k < start; k += 1) if (state[k] === 1) skippedFill = true
      if (fits && !skippedFill) {
        starts[ci] = start
        if (dfs(start + len + 1, ci + 1)) return true
      }
      if (state[start] === 1) break // can't slide past a known fill
    }
    return false
  }
  return dfs(0, 0) ? starts.slice() : null
}

const fillFromStarts = (starts: number[], runs: number[], n: number): boolean[] => {
  const fill = new Array(n).fill(false)
  starts.forEach((s, i) => {
    for (let k = s; k < s + runs[i]; k += 1) fill[k] = true
  })
  return fill
}

const leftmostFill = (state: State[], runs: number[]): boolean[] | null => {
  const s = leftmostStarts(state, runs)
  return s && fillFromStarts(s, runs, state.length)
}

const rightmostFill = (state: State[], runs: number[]): boolean[] | null => {
  const s = leftmostStarts([...state].reverse(), [...runs].reverse())
  return s && fillFromStarts(s, [...runs].reverse(), state.length).reverse()
}

const strip = (label: string, fill: boolean[]): string =>
  `${label.padEnd(12)}${fill.map((f) => (f ? '█' : '·')).join('')}`

/** Priority of each technique — higher is surfaced first (fills before X's). */
const SCORE: Record<Exclude<HintKind, 'mistake' | 'reveal'>, number> = {
  complete: 6,
  overlap: 5,
  cap: 3,
  reach: 2,
}

export function findHint(marks: readonly number[], puzzle: Nonogram): Hint | null {
  const { rows, cols, solution, rowClues, colClues } = puzzle
  const rowIdx = (r: number): number[] => Array.from({ length: cols }, (_, c) => r * cols + c)
  const colIdx = (c: number): number[] => Array.from({ length: rows }, (_, r) => r * cols + c)
  const cellsOf = (idxs: number[]): Cell[] => idxs.map((i) => (marks[i] ?? 0) as Cell)

  // 1) Mistakes first — an error blocks all correct progress. Prefer to spotlight
  // a line the mark makes provably impossible (a real lesson); fall back to the
  // picture when the slip is only wrong globally.
  for (let i = 0; i < marks.length; i += 1) {
    const wrongFill = marks[i] === 1 && !solution[i]
    const wrongCross = marks[i] === 2 && solution[i]
    if (!wrongFill && !wrongCross) continue
    const r = Math.floor(i / cols)
    const c = i % cols
    const rowBroken = !forcedCells(cellsOf(rowIdx(r)), rowClues[r])
    const colBroken = !forcedCells(cellsOf(colIdx(c)), colClues[c])
    const spot = rowBroken ? rowIdx(r) : colBroken ? colIdx(c) : rowIdx(r)
    const label = rowBroken ? `row ${r + 1}` : colBroken ? `column ${c + 1}` : `row ${r + 1}`
    const provable = rowBroken || colBroken
    return {
      cell: i,
      region: spot,
      kind: 'mistake',
      apply: 0,
      nudge: provable
        ? `${cap(label)} can't be completed as it stands — there's a slip on it.`
        : `A square in row ${r + 1} doesn't match the finished picture.`,
      lesson: provable
        ? `Line up ${label}'s filled squares and X-marks against its clue (${clueText(rowBroken ? rowClues[r] : colClues[c])}). There's no way to arrange the runs that fits what's marked, so one mark is wrong.`
        : `Every square is forced by the clues, and this one is set the opposite way to the solved picture. Clearing it and re-deducing is the way back.`,
      packing: [],
      reveal: wrongFill
        ? 'This square is empty in the solution — clear it.'
        : 'This square is filled in the solution — clear the X.',
    }
  }

  // 2) The most teachable forced square anywhere on the board.
  const lines = [
    ...rowClues.map((clue, r) => ({ idxs: rowIdx(r), clue, label: `row ${r + 1}` })),
    ...colClues.map((clue, c) => ({ idxs: colIdx(c), clue, label: `column ${c + 1}` })),
  ]
  let best: Hint | null = null
  let bestScore = 0
  for (const { idxs, clue, label } of lines) {
    const cells = cellsOf(idxs)
    const forced = forcedCells(cells, clue)
    if (!forced) continue // inconsistent — but any real slip was handled above
    const runs = toRuns(clue)
    const state = cells.map((c) => (c === 1 ? 1 : c === 2 ? 0 : -1)) as State[]
    const lf = leftmostFill(state, runs)
    const rf = rightmostFill(state, runs)
    const whole = runs.length > 0 && minSpan(runs) === idxs.length

    for (let k = 0; k < idxs.length; k += 1) {
      if (cells[k] !== 0) continue
      const doFill = forced.fill[k]
      if (!doFill && !forced.empty[k]) continue

      let kind: Exclude<HintKind, 'mistake' | 'reveal'>
      if (doFill) kind = whole ? 'complete' : 'overlap'
      else if ((k > 0 && cells[k - 1] === 1) || (k < idxs.length - 1 && cells[k + 1] === 1)) kind = 'cap'
      else kind = 'reach'
      if (SCORE[kind] <= bestScore) continue

      best = buildForcedHint(kind, idxs, k, clue, runs, forced.fill, lf, rf, label)
      bestScore = SCORE[kind]
    }
  }
  if (best) return best

  // 3) No single-line step remains — reveal one true square to break the stall.
  for (let i = 0; i < marks.length; i += 1) {
    if ((marks[i] ?? 0) !== 0) continue
    const r = Math.floor(i / cols)
    return {
      cell: i,
      region: rowIdx(r),
      kind: 'reveal',
      apply: solution[i] ? 1 : 2,
      nudge: `No single-line deduction is left from here — the next step needs comparing a row and a column together.`,
      lesson: `When one line alone can't settle anything, a filled square you place in a column often unlocks the row it crosses (and vice-versa). Here's one true square in row ${r + 1} to get that going again.`,
      packing: [],
      reveal: solution[i]
        ? 'In the solution this square is filled.'
        : 'In the solution this square is empty — mark it with an X.',
    }
  }
  return null
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const clueText = (clue: number[]): string => (clue.length === 1 && clue[0] === 0 ? '0' : clue.join(' '))

function buildForcedHint(
  kind: Exclude<HintKind, 'mistake' | 'reveal'>,
  idxs: number[],
  k: number,
  clue: number[],
  runs: number[],
  forcedFill: boolean[],
  lf: boolean[] | null,
  rf: boolean[] | null,
  label: string,
): Hint {
  const cell = idxs[k]
  const region = idxs
  const clueStr = clueText(clue)
  const both = lf && rf ? [strip('far-left', lf), strip('far-right', rf), strip('overlap', forcedFill)] : []

  if (kind === 'complete') {
    return {
      cell,
      region,
      kind,
      apply: 1,
      nudge: `${cap(label)} is fully pinned down — its clue (${clueStr}) only fits one way in ${idxs.length} squares.`,
      lesson: `Add the runs plus the single gaps they need between them: ${runs.join(' + ')}${runs.length > 1 ? ` + ${runs.length - 1} gap${runs.length > 2 ? 's' : ''}` : ''} = ${idxs.length}, exactly the length. With no slack there's only one arrangement, so every square in the line is decided.`,
      packing: lf ? [strip('the one fit', lf)] : [],
      reveal: 'This square is filled in that one arrangement — fill it in.',
    }
  }
  if (kind === 'overlap') {
    return {
      cell,
      region,
      kind,
      apply: 1,
      nudge: `Look at ${label}. A run in its clue (${clueStr}) is long enough to overlap itself — some squares stay filled however it slides.`,
      lesson: `Push the runs as far left as they'll go, then as far right. Any square filled in BOTH extremes is locked in no matter what happens between. Compare the two, and take the overlap:`,
      packing: both,
      reveal: 'This square is filled in both the far-left and far-right fit — fill it in.',
    }
  }
  if (kind === 'cap') {
    return {
      cell,
      region,
      kind,
      apply: 2,
      nudge: `${cap(label)} has a filled run ending right beside this square.`,
      lesson: `A run is exactly as long as its clue says — no longer. The filled run next to this square is already the length it needs, so it can't reach in here; a completed run always has a blank capping each end.`,
      packing: [],
      reveal: 'This square must be empty — mark it with an X.',
    }
  }
  // reach
  return {
    cell,
    region,
    kind,
    apply: 2,
    nudge: `In ${label}, no run can reach this square.`,
    lesson: `Try fitting the clue (${clueStr}) every which way — hard left, hard right, everywhere between. This square comes up blank in all of them, so nothing can ever fill it:`,
    packing: lf && rf ? [strip('far-left', lf), strip('far-right', rf)] : [],
    reveal: 'This square must be empty — mark it with an X.',
  }
}
