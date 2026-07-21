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
