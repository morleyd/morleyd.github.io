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
  /** Artist credit for imported pixel art (shown on solve), e.g. CC0 sources. */
  credit?: string
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
 * too sparse), then deriving clues. Deterministically re-rolls (seed + salt)
 * until the grid's clues admit exactly one solution, so the player can never
 * paint a clue-satisfying grid that isn't THE grid. The salt cap is a safety
 * net — a unique roll shows up within a handful of tries in practice.
 */
export function generateNonogram(rows: number, cols: number, seed: string): Nonogram {
  const rng = rngFromSeed(`${rows}x${cols}:${seed}`)
  let solution: Solution = []
  let rc: number[][] = []
  let cc: number[][] = []
  for (let salt = 0; salt < 400; salt += 1) {
    const r = salt === 0 ? rng : rngFromSeed(`${rows}x${cols}:${seed}:${salt}`)
    solution = Array.from({ length: rows * cols }, () => r() < 0.55)
    rc = rowClues(solution, rows, cols)
    cc = colClues(solution, rows, cols)
    if (solution.some(Boolean) && countSolutions(rc, cc, 2) === 1) break
  }

  return { rows, cols, solution, rowClues: rc, colClues: cc, seed }
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
 * Whether the player's filled cells are exactly the solution picture. Every
 * shipped puzzle is uniquely determined by its clues (enforced by
 * `countSolutions` in tests and by the generator), so any clue-satisfying grid
 * IS the picture — comparing cells directly just also rejects a partial grid
 * whose fills happen to sit in the wrong spots mid-solve.
 */
export function isSolved(marks: boolean[], puzzle: Nonogram): boolean {
  const { solution } = puzzle
  return marks.length === solution.length && solution.every((v, i) => marks[i] === v)
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
 * Whether the line's FILLED cells are exactly the solution's — complete AND in
 * the right spots, not merely a clue-satisfying arrangement. Check uses this
 * for green so a run parked in the wrong columns is never blessed.
 */
export function lineCorrect(cells: Cell[], solutionLine: boolean[]): boolean {
  return solutionLine.every((filled, i) => (cells[i] === FILLED) === filled)
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
 * Encode the puzzle and the player's current progress as plain text a human —
 * or an LLM being asked for help — can read unambiguously: numbered row/column
 * clues plus a ruler-labelled board (`#` filled, `x` marked-empty, `.` unknown,
 * with a tens/ones column ruler so any cell is countable at a glance). The
 * solution is deliberately omitted so a helper reasons from the same
 * information the player has, and gives hints rather than the answer.
 */
export function serializeForLLM(puzzle: Nonogram, marks: readonly number[]): string {
  const { rows, cols, rowClues, colClues } = puzzle
  const glyph = (c: number): string => (c === FILLED ? '#' : c === CROSS ? 'x' : '.')
  const clueText = (clue: number[]): string =>
    clue.length === 1 && clue[0] === 0 ? '0' : clue.join(' ')

  const rowDigits = String(rows).length
  const label = (n: number): string => `r${String(n).padStart(rowDigits)}: `
  const pad = ' '.repeat(1 + rowDigits + 2) // gutter width of `r{n}: `

  // Column ruler: tens over ones, so column N is found by reading down.
  const nums = Array.from({ length: cols }, (_, i) => i + 1)
  const tens = nums.map((n) => (n >= 10 ? String(Math.floor(n / 10)) : ' ')).join('')
  const ones = nums.map((n) => String(n % 10)).join('')
  const ruler = cols >= 10 ? [pad + tens, pad + ones] : [pad + ones]

  const colLine = colClues.map((clue, c) => `c${c + 1}: ${clueText(clue)}`).join(' | ')

  const board = rowClues.map((clue, r) => {
    const cells = Array.from({ length: cols }, (_, c) => glyph(marks[r * cols + c] ?? EMPTY)).join('')
    return `${label(r + 1)}${cells}  (${clueText(clue)})`
  })

  return [
    `Nonogram ${rows}×${cols}`,
    'Legend: # = filled, x = marked empty, . = unknown',
    '',
    `Column clues (top→bottom), c1…c${cols}:`,
    `  ${colLine}`,
    '',
    'Board — each row shows its current cells then its clue (left→right):',
    ...ruler,
    ...board,
  ].join('\n')
}

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

// --- Solution counting ----------------------------------------------------
// Used to guarantee puzzles are uniquely determined by their clues: the
// pattern-library test asserts countSolutions === 1 for every picture, and
// generateNonogram re-rolls until its random grid is unique.

/** Grid/line cell state while solving: -1 unknown, 0 known-empty, 1 known-filled. */
type SolveState = -1 | 0 | 1

/**
 * Enumerate every placement of `runs` compatible with the line's known cells
 * (as fill bitmasks — lines are ≤ 30 cells). Returns the bitwise OR and AND of
 * all placements, or null when none fits: a bit clear in `or` is empty in every
 * placement, a bit set in `and` is filled in every placement.
 */
function linePlacements(state: SolveState[], runs: number[]): { or: number; and: number } | null {
  const n = state.length
  // Minimum cells needed for runs i.. (their lengths + single gaps between).
  const need: number[] = new Array(runs.length + 1).fill(0)
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    need[i] = runs[i] + need[i + 1] + (i + 1 < runs.length ? 1 : 0)
  }
  let or = 0
  let and = -1
  let any = false
  const rec = (pos: number, ci: number, acc: number) => {
    if (ci === runs.length) {
      for (let k = pos; k < n; k += 1) if (state[k] === 1) return // leftover fill
      or |= acc
      and &= acc
      any = true
      return
    }
    const len = runs[ci]
    for (let start = pos; start + need[ci] <= n; start += 1) {
      let fits = true
      for (let k = start; k < start + len; k += 1) {
        if (state[k] === 0) {
          fits = false
          break
        }
      }
      // The run must be followed by a gap (line edge or a non-filled cell).
      if (fits && (start + len === n || state[start + len] !== 1)) {
        rec(start + len + 1, ci + 1, acc | (((1 << len) - 1) << start))
      }
      // Advancing `start` leaves this cell empty — illegal over a known fill.
      if (state[start] === 1) return
    }
  }
  rec(0, 0, 0)
  return any ? { or, and } : null
}

/**
 * Which cells a single line's clue forces given the player's current marks, by
 * intersecting every clue-compatible arrangement (the overlap / line-solving
 * technique). A cell is `fill` when every arrangement fills it, `empty` when
 * none does; cells the marks leave undecided fall in neither. Returns null when
 * the marks already contradict the clue. The hint engine runs this per line to
 * find the next logically-forced square. Marks map to solver state: an X-mark is
 * known-empty, an unpainted cell is unknown (NOT known-empty).
 */
export function forcedCells(
  cells: Cell[],
  clue: number[],
): { fill: boolean[]; empty: boolean[] } | null {
  const runs = clue.length === 1 && clue[0] === 0 ? [] : clue
  const state: SolveState[] = cells.map((c) => (c === FILLED ? 1 : c === CROSS ? 0 : -1))
  const res = linePlacements(state, runs)
  if (!res) return null
  const fill = cells.map((_, k) => Boolean(res.and & (1 << k)))
  const empty = cells.map((_, k) => !(res.or & (1 << k)))
  return { fill, empty }
}

/**
 * Count the solutions to a clue set, stopping at `limit` (default 2 — enough to
 * distinguish unique / not unique). Line-by-line constraint propagation to a
 * fixpoint, then branch on the first undetermined cell. Grids up to 30×30.
 * `onSolution` receives each solution grid as it's found (for diagnostics).
 */
export function countSolutions(
  rowClues: number[][],
  colClues: number[][],
  limit = 2,
  onSolution?: (solution: Solution) => void,
): number {
  const rows = rowClues.length
  const cols = colClues.length
  const rowRuns = rowClues.map((c) => (c.length === 1 && c[0] === 0 ? [] : c))
  const colRuns = colClues.map((c) => (c.length === 1 && c[0] === 0 ? [] : c))
  let count = 0

  // Deduce forced cells on one line; returns false on contradiction.
  const deduceLine = (grid: Int8Array, cells: number[], runs: number[]): boolean => {
    const state = cells.map((i) => grid[i] as SolveState)
    const res = linePlacements(state, runs)
    if (!res) return false
    for (let k = 0; k < cells.length; k += 1) {
      if (grid[cells[k]] !== -1) continue
      if (!(res.or & (1 << k))) grid[cells[k]] = 0
      else if (res.and & (1 << k)) grid[cells[k]] = 1
    }
    return true
  }

  const rowIdx = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => r * cols + c),
  )
  const colIdx = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => r * cols + c),
  )

  const propagate = (grid: Int8Array): boolean => {
    for (;;) {
      const before = grid.join('')
      for (let r = 0; r < rows; r += 1) if (!deduceLine(grid, rowIdx[r], rowRuns[r])) return false
      for (let c = 0; c < cols; c += 1) if (!deduceLine(grid, colIdx[c], colRuns[c])) return false
      if (grid.join('') === before) return true
    }
  }

  const search = (grid: Int8Array): void => {
    if (count >= limit) return
    if (!propagate(grid)) return
    const i = grid.indexOf(-1)
    if (i < 0) {
      count += 1
      onSolution?.(Array.from(grid, (v) => v === 1))
      return
    }
    for (const v of [1, 0] as const) {
      const branch = Int8Array.from(grid)
      branch[i] = v
      search(branch)
      if (count >= limit) return
    }
  }

  search(new Int8Array(rows * cols).fill(-1))
  return count
}

/** Whether the puzzle's clues admit exactly one solution. */
export function hasUniqueSolution(p: Pick<Nonogram, 'rowClues' | 'colClues'>): boolean {
  return countSolutions(p.rowClues, p.colClues, 2) === 1
}
