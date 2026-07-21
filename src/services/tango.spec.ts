import { describe, it, expect } from 'vitest'
import {
  CELLS,
  EMPTY,
  HALF,
  MOON,
  SIZE,
  SUN,
  countSolutions,
  findConflicts,
  generateSolved,
  generateTango,
  isSolved,
  solve,
  type Constraint,
  type Grid,
} from './tango'

const isValidFull = (grid: Grid, constraints: Constraint[]): boolean => {
  if (grid.some((v) => v !== SUN && v !== MOON)) return false
  for (let r = 0; r < SIZE; r += 1) {
    let s = 0
    for (let c = 0; c < SIZE; c += 1) if (grid[r * SIZE + c] === SUN) s += 1
    if (s !== HALF) return false
  }
  for (let c = 0; c < SIZE; c += 1) {
    let s = 0
    for (let r = 0; r < SIZE; r += 1) if (grid[r * SIZE + c] === SUN) s += 1
    if (s !== HALF) return false
  }
  return findConflicts(grid, constraints).size === 0
}

describe('generateSolved', () => {
  it('builds a balanced, triple-free board', () => {
    const grid = generateSolved(() => 0.5)
    expect(grid).toHaveLength(CELLS)
    expect(isValidFull(grid, [])).toBe(true)
  })
  it('varies with the RNG', () => {
    const a = generateSolved(() => 0.2)
    const b = generateSolved(() => 0.8)
    expect(a).not.toEqual(b)
  })
})

describe('findConflicts', () => {
  it('flags three-in-a-row', () => {
    const grid: Grid = new Array(CELLS).fill(EMPTY)
    grid[0] = SUN
    grid[1] = SUN
    grid[2] = SUN
    const conflicts = findConflicts(grid, [])
    expect(conflicts.has(0)).toBe(true)
    expect(conflicts.has(2)).toBe(true)
  })
  it('flags too many of one symbol in a row', () => {
    const grid: Grid = new Array(CELLS).fill(EMPTY)
    // 4 moons in row 0 (> HALF) arranged to avoid a three-in-a-row.
    grid[0] = MOON
    grid[1] = MOON
    grid[2] = SUN
    grid[3] = MOON
    grid[4] = MOON
    expect(findConflicts(grid, []).size).toBeGreaterThan(0)
  })
  it('flags a violated equality constraint', () => {
    const grid: Grid = new Array(CELLS).fill(EMPTY)
    grid[0] = SUN
    grid[1] = MOON
    const constraints: Constraint[] = [{ a: 0, b: 1, kind: 'eq' }]
    expect(findConflicts(grid, constraints).has(0)).toBe(true)
  })
  it('accepts a satisfied opposite constraint', () => {
    const grid: Grid = new Array(CELLS).fill(EMPTY)
    grid[0] = SUN
    grid[1] = MOON
    const constraints: Constraint[] = [{ a: 0, b: 1, kind: 'opp' }]
    expect(findConflicts(grid, constraints).size).toBe(0)
  })
})

describe('generateTango', () => {
  it('is deterministic for a seed', () => {
    const a = generateTango('seed-x')
    const b = generateTango('seed-x')
    expect(a.given).toEqual(b.given)
    expect(a.solution).toEqual(b.solution)
    expect(a.constraints).toEqual(b.constraints)
  })

  it('produces a unique solution matching the stored solution', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { given, solution, constraints } = generateTango(seed)
      expect(isValidFull(solution, constraints)).toBe(true)
      expect(countSolutions(given, constraints, 2)).toBe(1)
      expect(solve(given, constraints)).toEqual(solution)
    }
  })

  it('constraints are consistent with the solution', () => {
    const { solution, constraints } = generateTango('consistent')
    for (const { a, b, kind } of constraints) {
      if (kind === 'eq') expect(solution[a]).toBe(solution[b])
      else expect(solution[a]).not.toBe(solution[b])
    }
  })

  it('leaves at least one blank (clues are trimmed)', () => {
    const { given } = generateTango('trim')
    expect(given.some((v) => v === EMPTY)).toBe(true)
  })
})

describe('solver rejects inconsistent givens', () => {
  it('returns 0 / null when givens already break a rule', () => {
    const given: Grid = new Array(CELLS).fill(EMPTY)
    given[0] = SUN
    given[1] = SUN
    given[2] = SUN // three-in-a-row among givens
    expect(countSolutions(given, [], 2)).toBe(0)
    expect(solve(given, [])).toBeNull()
  })
})

describe('isSolved', () => {
  it('is true only for a full, valid grid', () => {
    const { solution, constraints } = generateTango('done')
    expect(isSolved(solution, constraints)).toBe(true)
    const partial = solution.slice()
    partial[0] = EMPTY
    expect(isSolved(partial, constraints)).toBe(false)
  })
})
