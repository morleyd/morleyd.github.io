import { describe, it, expect } from 'vitest'
import {
  CELLS,
  N,
  countSolutions,
  findConflicts,
  generatePuzzle,
  generateSolved,
  isComplete,
  isValidPlacement,
  solve,
  usedValues,
  type Grid,
  type Difficulty,
} from './sudoku'

const isValidSolution = (grid: Grid): boolean => {
  if (grid.some((v) => v < 1 || v > 9)) return false
  const unit = (cells: number[]) => new Set(cells).size === N
  for (let r = 0; r < N; r += 1) {
    const row: number[] = []
    const col: number[] = []
    for (let c = 0; c < N; c += 1) {
      row.push(grid[r * N + c])
      col.push(grid[c * N + r])
    }
    if (!unit(row) || !unit(col)) return false
  }
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const box: number[] = []
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) box.push(grid[(br * 3 + dr) * N + (bc * 3 + dc)])
      }
      if (!unit(box)) return false
    }
  }
  return true
}

describe('usedValues / isValidPlacement', () => {
  it('collects row, column, and box values', () => {
    const grid: Grid = new Array(CELLS).fill(0)
    grid[0] = 1 // r0c0
    grid[8] = 2 // r0c8 (same row)
    grid[9] = 3 // r1c0 (same col)
    grid[10] = 4 // r1c1 (same box)
    const used = usedValues(grid, 1) // r0c1
    expect(used).toEqual(new Set([1, 2, 3, 4]))
    expect(isValidPlacement(grid, 1, 5)).toBe(true)
    expect(isValidPlacement(grid, 1, 2)).toBe(false)
  })
})

describe('generateSolved', () => {
  it('produces a fully valid solution', () => {
    const grid = generateSolved(() => 0.5)
    expect(grid).toHaveLength(CELLS)
    expect(isValidSolution(grid)).toBe(true)
  })
})

describe('countSolutions', () => {
  it('finds exactly one solution for a solved grid', () => {
    expect(countSolutions(generateSolved(() => 0.3), 2)).toBe(1)
  })
  it('finds multiple solutions for an empty grid (capped at limit)', () => {
    expect(countSolutions(new Array(CELLS).fill(0), 2)).toBe(2)
  })
})

describe('solve', () => {
  it('completes a generated puzzle back to its solution', () => {
    const { puzzle, solution } = generatePuzzle('easy', 'test-seed')
    expect(solve(puzzle)).toEqual(solution)
  })
  it('returns null for a contradictory grid', () => {
    const grid: Grid = new Array(CELLS).fill(0)
    grid[0] = 5
    grid[1] = 5 // two 5s in the same row → unsolvable
    expect(solve(grid)).toBeNull()
  })
})

describe('generatePuzzle', () => {
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

  it('is deterministic for a given difficulty + seed', () => {
    const a = generatePuzzle('medium', 'abc123')
    const b = generatePuzzle('medium', 'abc123')
    expect(a.puzzle).toEqual(b.puzzle)
    expect(a.solution).toEqual(b.solution)
  })

  it('has a unique solution matching the stored solution', () => {
    for (const d of difficulties) {
      const { puzzle, solution } = generatePuzzle(d, `seed-${d}`)
      expect(countSolutions(puzzle, 2)).toBe(1)
      expect(solve(puzzle)).toEqual(solution)
      expect(isValidSolution(solution)).toBe(true)
    }
  })

  it('marks givens exactly where the puzzle is non-blank', () => {
    const { puzzle, given } = generatePuzzle('hard', 'g')
    puzzle.forEach((v, i) => expect(given[i]).toBe(v !== 0))
  })

  it('leaves fewer givens for harder difficulties', () => {
    const easy = generatePuzzle('easy', 's').given.filter(Boolean).length
    const expert = generatePuzzle('expert', 's').given.filter(Boolean).length
    expect(easy).toBeGreaterThan(expert)
  })
})

describe('findConflicts / isComplete', () => {
  it('flags both cells of a duplicate in a unit', () => {
    const grid: Grid = new Array(CELLS).fill(0)
    grid[0] = 7
    grid[2] = 7 // same row + same box
    const conflicts = findConflicts(grid)
    expect(conflicts.has(0)).toBe(true)
    expect(conflicts.has(2)).toBe(true)
  })
  it('reports completion only for a full, conflict-free grid', () => {
    const solution = generatePuzzle('easy', 'done').solution
    expect(isComplete(solution)).toBe(true)
    const broken = solution.slice()
    broken[0] = 0
    expect(isComplete(broken)).toBe(false)
  })
})
