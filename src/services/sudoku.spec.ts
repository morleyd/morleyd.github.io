import { describe, it, expect } from 'vitest'
import {
  CELLS,
  N,
  clearCell,
  countSolutions,
  findConflicts,
  generatePuzzle,
  generateSolved,
  isComplete,
  isValidPlacement,
  placeLockedDigit,
  solve,
  usedValues,
  type Grid,
  type Difficulty,
} from './sudoku'
import {
  computeCandidates,
  digitsOf,
  findClaiming,
  findHiddenPair,
  findHiddenSingle,
  findHint,
  findNakedPair,
  findNakedSingle,
  findPointing,
} from './sudokuHints'

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

describe('placeLockedDigit (lock toggle-delete)', () => {
  const givens = (indices: number[]): boolean[] => {
    const g = new Array<boolean>(CELLS).fill(false)
    for (const i of indices) g[i] = true
    return g
  }

  it('places the locked digit into an empty cell (no delete)', () => {
    const cells: Grid = new Array(CELLS).fill(0)
    const { grid, cleared } = placeLockedDigit(cells, givens([]), 40, 3)
    expect(grid[40]).toBe(3)
    expect(cleared).toBe(false) // a placement — the caller may advance the lock
    expect(cells[40]).toBe(0) // original grid is untouched (returns a copy)
  })

  it('clears the cell when it already holds the locked digit, and does not advance', () => {
    const cells: Grid = new Array(CELLS).fill(0)
    cells[40] = 3 // player already placed a 3 here
    const { grid, cleared } = placeLockedDigit(cells, givens([]), 40, 3)
    expect(grid[40]).toBe(0) // toggle-delete removed it
    expect(cleared).toBe(true) // signals the caller NOT to advance the lock
  })

  it('replaces a different digit rather than deleting', () => {
    const cells: Grid = new Array(CELLS).fill(0)
    cells[40] = 5
    const { grid, cleared } = placeLockedDigit(cells, givens([]), 40, 3)
    expect(grid[40]).toBe(3)
    expect(cleared).toBe(false)
  })

  it('never touches a given cell', () => {
    const cells: Grid = new Array(CELLS).fill(0)
    cells[40] = 3
    const { grid, cleared } = placeLockedDigit(cells, givens([40]), 40, 3)
    expect(grid[40]).toBe(3) // unchanged
    expect(cleared).toBe(false)
  })
})

describe('clearCell (erase)', () => {
  it('clears a selected non-given cell', () => {
    const cells: Grid = new Array(CELLS).fill(0)
    cells[12] = 7
    const given = new Array<boolean>(CELLS).fill(false)
    const grid = clearCell(cells, given, 12)
    expect(grid[12]).toBe(0)
    expect(cells[12]).toBe(7) // returns a copy, original untouched
  })

  it('leaves a given cell untouched', () => {
    const cells: Grid = new Array(CELLS).fill(0)
    cells[12] = 7
    const given = new Array<boolean>(CELLS).fill(false)
    given[12] = true
    expect(clearCell(cells, given, 12)[12]).toBe(7)
  })
})

// --- Strategy-based hints -------------------------------------------------

/** 9-bit candidate mask for the given digits. */
const bits = (...ds: number[]): number => ds.reduce((m, d) => m | (1 << (d - 1)), 0)
/** All-cells-filled candidate array (0 = no candidates); set the cells you test. */
const blankCand = (): number[] => new Array<number>(CELLS).fill(0)

describe('digitsOf / computeCandidates', () => {
  it('lists the digits set in a mask, ascending', () => {
    expect(digitsOf(bits(3, 7, 1))).toEqual([1, 3, 7])
    expect(digitsOf(0)).toEqual([])
  })

  it('leaves exactly the missing digit for a single blanked cell', () => {
    const solution = generatePuzzle('medium', 'cand').solution
    const grid = solution.slice()
    grid[40] = 0 // blank the centre cell
    const cand = computeCandidates(grid)
    expect(digitsOf(cand[40])).toEqual([solution[40]])
    expect(cand[0]).toBe(0) // filled cells carry no candidates
  })
})

describe('findNakedSingle', () => {
  it('finds a cell with a single candidate and reveals it last', () => {
    const cand = blankCand()
    cand[0] = bits(5) // r0c0, box 0 (labelled "box 1" — avoids clashing with digit 5)
    const hint = findNakedSingle(cand)
    expect(hint?.technique).toBe('naked-single')
    expect(hint?.placement).toEqual({ cell: 0, value: 5 })
    expect(hint?.unit).toEqual({ type: 'box', index: 0 })
    // Value is only revealed on the final nudge.
    const levels = hint?.levels ?? []
    expect(levels.length).toBeGreaterThanOrEqual(3)
    expect(levels[0]).not.toContain('5')
    expect(levels[levels.length - 1]).toContain('5')
  })

  it('returns null when every cell has two or more candidates', () => {
    const cand = blankCand()
    cand[0] = bits(1, 2)
    cand[1] = bits(3, 4)
    expect(findNakedSingle(cand)).toBeNull()
  })
})

describe('findHiddenSingle', () => {
  it('finds a digit that fits only one cell of a unit', () => {
    const cand = blankCand()
    // In row 0, digit 7 is a candidate only in cell 0 (which also allows 8).
    cand[0] = bits(7, 8)
    cand[1] = bits(8, 9)
    cand[2] = bits(8, 9)
    const hint = findHiddenSingle(cand)
    expect(hint?.technique).toBe('hidden-single')
    expect(hint?.placement).toEqual({ cell: 0, value: 7 })
    expect(hint?.digits).toEqual([7])
    expect((hint?.levels ?? []).at(-1)).toContain('7')
  })

  it('ignores naked singles (reported by the easier technique)', () => {
    const cand = blankCand()
    cand[0] = bits(7) // sole candidate → naked, not hidden
    expect(findHiddenSingle(cand)).toBeNull()
  })
})

describe('findPointing', () => {
  it('confines a box candidate to one row and clears the rest of that row', () => {
    const cand = blankCand()
    // Box 0: digit 4 only in row 0 (cells 0 and 1)...
    cand[0] = bits(4, 5)
    cand[1] = bits(4, 6)
    // ...but 4 is also a candidate in the same row outside box 0 (cell 3).
    cand[3] = bits(4, 7)
    const hint = findPointing(cand)
    expect(hint?.technique).toBe('pointing')
    expect(hint?.digits).toEqual([4])
    expect(hint?.unit).toEqual({ type: 'box', index: 0 })
    expect(hint?.eliminations).toEqual([{ cell: 3, value: 4 }])
  })

  it('returns null when the box candidate is not confined to a single line', () => {
    const cand = blankCand()
    cand[0] = bits(4) // row 0
    cand[10] = bits(4) // row 1 → two rows, no pointing
    expect(findPointing(cand)).toBeNull()
  })
})

describe('findClaiming', () => {
  it('confines a row candidate to one box and clears the rest of that box', () => {
    const cand = blankCand()
    // Row 0: digit 3 only in box 0 (cells 0 and 1)...
    cand[0] = bits(3, 5)
    cand[1] = bits(3, 6)
    // ...but 3 is also a candidate elsewhere in box 0 (cell 9, row 1).
    cand[9] = bits(3, 7)
    const hint = findClaiming(cand)
    expect(hint?.technique).toBe('claiming')
    expect(hint?.digits).toEqual([3])
    expect(hint?.unit).toEqual({ type: 'row', index: 0 })
    expect(hint?.eliminations).toEqual([{ cell: 9, value: 3 }])
  })
})

describe('findNakedPair', () => {
  it('finds two cells sharing the same two candidates and clears them elsewhere', () => {
    const cand = blankCand()
    cand[0] = bits(1, 2)
    cand[1] = bits(1, 2) // identical pair with cell 0
    cand[2] = bits(1, 3) // shares digit 1 → 1 can be removed here
    const hint = findNakedPair(cand)
    expect(hint?.technique).toBe('naked-pair')
    expect(hint?.digits).toEqual([1, 2])
    expect(hint?.cells).toEqual([0, 1])
    expect(hint?.eliminations).toEqual([{ cell: 2, value: 1 }])
  })

  it('returns null when a pair eliminates nothing', () => {
    const cand = blankCand()
    cand[0] = bits(1, 2)
    cand[1] = bits(1, 2)
    cand[2] = bits(3, 4) // no overlap → no elimination
    expect(findNakedPair(cand)).toBeNull()
  })
})

describe('findHiddenPair', () => {
  it('finds two digits confined to the same two cells and strips extras', () => {
    const cand = blankCand()
    // In row 0, digits 4 and 5 appear only in cells 0 and 1, each with extras.
    cand[0] = bits(4, 5, 6)
    cand[1] = bits(4, 5, 7)
    const hint = findHiddenPair(cand)
    expect(hint?.technique).toBe('hidden-pair')
    expect(hint?.digits).toEqual([4, 5])
    expect(hint?.cells).toEqual([0, 1])
    expect(hint?.eliminations).toEqual([
      { cell: 0, value: 6 },
      { cell: 1, value: 7 },
    ])
  })
})

describe('findHint (integration + priority)', () => {
  it('returns a naked single for a grid missing one cell', () => {
    const solution = generatePuzzle('easy', 'hint').solution
    const grid = solution.slice()
    grid[20] = 0
    const hint = findHint(grid)
    expect(hint?.technique).toBe('naked-single')
    expect(hint?.placement).toEqual({ cell: 20, value: solution[20] })
  })

  it('only ever forces correct placements (never a wrong move)', () => {
    const { puzzle, solution } = generatePuzzle('easy', 'logic-solve')
    const grid = puzzle.slice()
    let placed = 0
    for (let guard = 0; guard < CELLS * 5 && grid.some((v) => v === 0); guard += 1) {
      const hint = findHint(grid)
      if (!hint || !hint.placement) break // no move, or an elimination-only step
      // Every forced single must agree with the unique solution.
      expect(hint.placement.value).toBe(solution[hint.placement.cell])
      grid[hint.placement.cell] = hint.placement.value
      placed += 1
    }
    expect(placed).toBeGreaterThan(0)
  })

  it('returns null for an empty grid (nothing is forced)', () => {
    expect(findHint(new Array<number>(CELLS).fill(0))).toBeNull()
  })
})
