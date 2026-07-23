/**
 * Nonogram (Picross) engine — generate a seeded puzzle from a random picture,
 * derive its row/column clues, and check line/solve validity. Pure and
 * deterministic so a puzzle is shareable from its seed.
 *
 * The solution is a boolean grid (true = filled). Clues are the run-lengths of
 * consecutive filled cells in each row and column, e.g. [2, 1].
 */

import { rngFromSeed } from './seed'

export type Solution = boolean[] // length rows*cols, row-major

export interface Nonogram {
  rows: number
  cols: number
  solution: Solution
  rowClues: number[][]
  colClues: number[][]
  seed: string
}

/**
 * A hand-authored picture. `rows` are drawn as text (see nonogramPatterns): `#`
 * is a filled cell, any other character empty. Every row must be `size` chars
 * and there must be `size` rows.
 */
export interface NonogramPattern {
  id: string
  name: string
  size: number
  rows: string[]
  /** Retired from the picker/random pool but still loadable by id, so shared
   *  URLs from before the library rework keep resolving to the same picture. */
  legacy?: boolean
}

/** Run-lengths of consecutive `true`s in a line. An empty line clues to [0]. */
export function lineClue(line: boolean[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const filled of line) {
    if (filled) {
      run += 1
    } else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs.length ? runs : [0]
}

const row = (grid: Solution, cols: number, r: number): boolean[] =>
  grid.slice(r * cols, (r + 1) * cols)

const col = (grid: Solution, rows: number, cols: number, c: number): boolean[] => {
  const out: boolean[] = []
  for (let r = 0; r < rows; r += 1) out.push(grid[r * cols + c])
  return out
}

export function rowClues(grid: Solution, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) => lineClue(row(grid, cols, r)))
}

export function colClues(grid: Solution, rows: number, cols: number): number[][] {
  return Array.from({ length: cols }, (_, c) => lineClue(col(grid, rows, cols, c)))
}

/**
 * Generate a puzzle by randomly filling cells (biased ~55% so pictures aren't
 * too sparse), then deriving clues. Re-rolls the rare all-empty grid.
 */
export function generateNonogram(rows: number, cols: number, seed: string): Nonogram {
  const rng = rngFromSeed(`${rows}x${cols}:${seed}`)
  let solution: Solution
  let salt = 0
  do {
    const r = salt === 0 ? rng : rngFromSeed(`${rows}x${cols}:${seed}:${salt}`)
    solution = Array.from({ length: rows * cols }, () => r() < 0.55)
    salt += 1
  } while (solution.every((v) => !v))

  return {
    rows,
    cols,
    solution,
    rowClues: rowClues(solution, rows, cols),
    colClues: colClues(solution, rows, cols),
    seed,
  }
}

/** Turn a text picture (`#` = filled) into a row-major boolean solution grid. */
export function patternToSolution(pattern: NonogramPattern): Solution {
  return pattern.rows.flatMap((line) => Array.from(line, (ch) => ch === '#'))
}

/**
 * Build a solvable puzzle from a hand-authored picture: the picture is the
 * solution, and its clues are derived from it. Deterministic — the seed is the
 * pattern id so the URL stays shareable.
 */
export function nonogramFromPattern(pattern: NonogramPattern): Nonogram {
  const { size } = pattern
  const solution = patternToSolution(pattern)
  return {
    rows: size,
    cols: size,
    solution,
    rowClues: rowClues(solution, size, size),
    colClues: colClues(solution, size, size),
    seed: `@${pattern.id}`,
  }
}

/**
 * Whether the player's filled cells satisfy all clues. A nonogram is solved when
 * every row and column clue matches — which can be true for a different-looking
 * grid than `solution` when the puzzle isn't uniquely determined, so we check
 * clues rather than exact cell equality.
 */
export function isSolved(marks: boolean[], puzzle: Nonogram): boolean {
  const { rows, cols, rowClues: rc, colClues: cc } = puzzle
  for (let r = 0; r < rows; r += 1) {
    if (!clueEquals(lineClue(row(marks, cols, r)), rc[r])) return false
  }
  for (let c = 0; c < cols; c += 1) {
    if (!clueEquals(lineClue(col(marks, rows, cols, c)), cc[c])) return false
  }
  return true
}

const clueEquals = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/** Whether a single line of marks already satisfies its clue (for row/col ticks). */
export function lineSatisfied(line: boolean[], clue: number[]): boolean {
  return clueEquals(lineClue(line), clue)
}

/**
 * Whether the line's FILLED cells already form exactly its clue — a complete,
 * correct line (X-marks and unknown-empty cells are ignored). This is the GREEN
 * counterpart to `lineConsistent`'s red: on Check a line is flagged green when it
 * is done correctly, and red when its fills can no longer match the clue. The two
 * are mutually exclusive — a complete line is always consistent.
 */
export function lineComplete(cells: Cell[], clue: number[]): boolean {
  return lineSatisfied(
    cells.map((c) => c === FILLED),
    clue,
  )
}

/**
 * A cell as the player has painted it: 0 = empty/unknown, 1 = filled,
 * 2 = X-marked (deduced empty). Matches the view's `marks` encoding, so a line
 * can be handed to these functions directly. X-marks and the line edge act as
 * hard run terminators; an unknown-empty cell does not (a run beside it could
 * still grow).
 */
export type Cell = 0 | 1 | 2
const EMPTY = 0
const FILLED = 1
const CROSS = 2

/**
 * Lock clue entries from the left: walk the line matching completed filled runs
 * to clue entries in order, stopping at the first ambiguity. A run counts as
 * matched only when it is genuinely closed — its far side is the line edge or an
 * X-mark (not an unknown-empty cell it could grow into) — and every gap crossed
 * on the way is an X-mark, never an unknown-empty that could hide another run.
 */
function lockFromLeft(cells: Cell[], clue: number[]): boolean[] {
  const locked = clue.map(() => false)
  const n = cells.length
  let pos = 0
  for (let i = 0; i < clue.length; i += 1) {
    while (pos < n && cells[pos] === CROSS) pos += 1 // skip known gaps
    if (pos >= n) break
    if (cells[pos] === EMPTY) break // unknown gap → a run could hide here; stop
    const start = pos
    while (pos < n && cells[pos] === FILLED) pos += 1
    if (pos - start !== clue[i]) break // run doesn't (yet) match this clue
    if (pos < n && cells[pos] === EMPTY) break // open on the right → could grow
    locked[i] = true
  }
  return locked
}

/**
 * Which individual clue entries are unambiguously placed by the current fills,
 * using the both-ends technique: an entry is satisfied if it is locked scanning
 * from the left OR from the right. Conservative — a coincidental partial fill
 * never greys a number. A line whose filled cells already form exactly the clue
 * marks every entry satisfied (the runs are pinned even if gaps are unmarked).
 */
export function satisfiedClues(cells: Cell[], clue: number[]): boolean[] {
  // Empty-line clue: its single 0 is "done" only when nothing is filled.
  if (clue.length === 1 && clue[0] === 0) return [!cells.some((c) => c === FILLED)]

  const filled = cells.map((c) => c === FILLED)
  if (clueEquals(lineClue(filled), clue)) return clue.map(() => true)

  const left = lockFromLeft(cells, clue)
  const rightRev = lockFromLeft([...cells].reverse(), [...clue].reverse())
  const right = rightRev.reverse()
  return clue.map((_, i) => left[i] || right[i])
}

/**
 * Whether the line, as painted, can still be completed to match its clue:
 * filled cells must be filled, X-marks must stay empty, unknown cells are free.
 * Returns false when the current fills already contradict the clue (used by
 * validation to flag a line red). Backtracking placement with memoization.
 */
export function lineConsistent(cells: Cell[], clue: number[]): boolean {
  const runs = clue.length === 1 && clue[0] === 0 ? [] : clue
  const n = cells.length
  const memo = new Map<number, boolean>()

  const solve = (pos: number, ci: number): boolean => {
    if (ci === runs.length) {
      for (let k = pos; k < n; k += 1) if (cells[k] === FILLED) return false
      return true
    }
    if (pos >= n) return false
    const key = pos * (runs.length + 1) + ci
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let ok = false
    const len = runs[ci]
    // Option 1: place run ci starting at pos.
    if (pos + len <= n) {
      let fits = true
      for (let k = pos; k < pos + len; k += 1) if (cells[k] === CROSS) fits = false
      // The run must be followed by a gap (edge or a non-filled cell).
      if (fits && pos + len < n && cells[pos + len] === FILLED) fits = false
      if (fits && solve(pos + len + 1, ci + 1)) ok = true
    }
    // Option 2: leave pos empty — only if it isn't a filled cell.
    if (!ok && cells[pos] !== FILLED && solve(pos + 1, ci)) ok = true

    memo.set(key, ok)
    return ok
  }

  return solve(0, 0)
}
