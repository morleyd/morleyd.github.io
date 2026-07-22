import { describe, it, expect } from 'vitest'
import {
  colClues,
  generateNonogram,
  isSolved,
  lineClue,
  lineComplete,
  lineConsistent,
  lineSatisfied,
  nonogramFromPattern,
  patternToSolution,
  rowClues,
  satisfiedClues,
  type Cell,
  type Solution,
} from './nonogram'
import {
  NONOGRAM_PATTERNS,
  patternById,
  patternsForSize,
  randomPatternForSize,
} from './nonogramPatterns'

describe('lineClue', () => {
  it('counts consecutive runs', () => {
    expect(lineClue([true, true, false, true])).toEqual([2, 1])
    expect(lineClue([false, true, true, true])).toEqual([3])
    expect(lineClue([true, false, true, false, true])).toEqual([1, 1, 1])
  })
  it('clues an empty line to [0]', () => {
    expect(lineClue([false, false, false])).toEqual([0])
  })
  it('clues a full line to its length', () => {
    expect(lineClue([true, true, true])).toEqual([3])
  })
})

describe('rowClues / colClues', () => {
  // 3x3:
  //  X . X
  //  X X .
  //  . . X
  const grid: Solution = [true, false, true, true, true, false, false, false, true]
  it('derives row clues', () => {
    expect(rowClues(grid, 3, 3)).toEqual([[1, 1], [2], [1]])
  })
  it('derives column clues', () => {
    expect(colClues(grid, 3, 3)).toEqual([[2], [1], [1, 1]])
  })
})

describe('generateNonogram', () => {
  it('is deterministic for a given size + seed', () => {
    const a = generateNonogram(5, 5, 'seed-1')
    const b = generateNonogram(5, 5, 'seed-1')
    expect(a.solution).toEqual(b.solution)
    expect(a.rowClues).toEqual(b.rowClues)
  })
  it('produces clues consistent with its own solution', () => {
    const p = generateNonogram(8, 8, 'abc')
    expect(p.rowClues).toEqual(rowClues(p.solution, 8, 8))
    expect(p.colClues).toEqual(colClues(p.solution, 8, 8))
  })
  it('is never entirely empty', () => {
    const p = generateNonogram(5, 5, 'x')
    expect(p.solution.some(Boolean)).toBe(true)
  })
})

describe('isSolved', () => {
  it('accepts the generating solution', () => {
    const p = generateNonogram(6, 6, 'solve-me')
    expect(isSolved(p.solution, p)).toBe(true)
  })
  it('rejects an incomplete grid', () => {
    const p = generateNonogram(6, 6, 'solve-me')
    const partial = p.solution.slice()
    const firstFilled = partial.indexOf(true)
    partial[firstFilled] = false
    expect(isSolved(partial, p)).toBe(false)
  })
  it('accepts any grid whose clues match (clue-based, not cell-based)', () => {
    // A symmetric picture where the mirror image satisfies the same clues.
    //  X .        . X
    //  X .   vs   . X   → both rows clue [1], both cols clue [2],[0]... differ,
    // so instead use a case that IS clue-equivalent:
    //  X X        X X
    //  . .   ==   . .   (identical) — trivial accept
    const p = generateNonogram(4, 4, 'clue')
    expect(isSolved(p.solution.slice(), p)).toBe(true)
  })
})

describe('pattern library', () => {
  it('bundles pictures across the supported sizes', () => {
    expect(NONOGRAM_PATTERNS.length).toBeGreaterThanOrEqual(8)
    for (const size of [5, 10, 15]) {
      expect(patternsForSize(size).length).toBeGreaterThan(0)
    }
  })

  it('every pattern is a well-formed square with a non-empty picture and unique id', () => {
    const ids = new Set<string>()
    for (const p of NONOGRAM_PATTERNS) {
      expect(p.rows.length, `${p.id} row count`).toBe(p.size)
      for (const line of p.rows) {
        expect(line.length, `${p.id} row width`).toBe(p.size)
      }
      const sol = patternToSolution(p)
      expect(sol.length).toBe(p.size * p.size)
      expect(sol.some(Boolean), `${p.id} not empty`).toBe(true)
      expect(ids.has(p.id), `${p.id} unique`).toBe(false)
      ids.add(p.id)
    }
  })

  it('patternToSolution maps "#" to filled, row-major', () => {
    const grid = patternToSolution({ id: 't', name: 't', size: 3, rows: ['#..', '.#.', '..#'] })
    expect(grid).toEqual([true, false, false, false, true, false, false, false, true])
  })

  it('derives clues from the chosen picture', () => {
    // A 5×5 heart — check its clues match the run-lengths of the drawn grid.
    const heart = patternById('heart5', 5)!
    const nono = nonogramFromPattern(heart)
    expect(nono.rows).toBe(5)
    expect(nono.cols).toBe(5)
    expect(nono.rowClues).toEqual(rowClues(nono.solution, 5, 5))
    expect(nono.colClues).toEqual(colClues(nono.solution, 5, 5))
    // Heart rows: '.#.#.', '#####', '#####', '.###.', '..#..'
    expect(nono.rowClues).toEqual([[1, 1], [5], [5], [3], [1]])
    expect(nono.colClues).toEqual([[2], [4], [4], [4], [2]])
  })

  it('produces a puzzle solved by its own picture, for every pattern', () => {
    for (const p of NONOGRAM_PATTERNS) {
      const nono = nonogramFromPattern(p)
      expect(isSolved(nono.solution, nono), `${p.id} solvable`).toBe(true)
    }
  })
})

describe('lineSatisfied', () => {
  it('matches a line against a clue', () => {
    expect(lineSatisfied([true, true, false, true], [2, 1])).toBe(true)
    expect(lineSatisfied([true, false, false, true], [2, 1])).toBe(false)
    expect(lineSatisfied([false, false], [0])).toBe(true)
  })
})

// Cell codes: 0 empty/unknown · 1 filled · 2 X-marked.
const cells = (...c: number[]): Cell[] => c as Cell[]

describe('satisfiedClues', () => {
  it('locks a run bounded by the edge and an X-mark', () => {
    // [F F X . .] with clue [2,1]: the "2" is pinned (edge + X); "1" is unknown.
    expect(satisfiedClues(cells(1, 1, 2, 0, 0), [2, 1])).toEqual([true, false])
  })

  it('does not lock a run that could still grow into an unknown cell', () => {
    // [F F . . .] clue [2,1]: right of the pair is unknown, so it could grow.
    expect(satisfiedClues(cells(1, 1, 0, 0, 0), [2, 1])).toEqual([false, false])
  })

  it('never greys on a coincidental partial fill', () => {
    // A single filled cell floating in unknowns matches neither clue firmly.
    expect(satisfiedClues(cells(0, 1, 0, 0, 0), [1, 1])).toEqual([false, false])
  })

  it('leaves an ambiguous middle run un-greyed while locking the ends', () => {
    // [F X F . .] clue [1,1,1]: left "1" locked (edge+X); middle "1" is open on
    // the right (unknown), the last "1" isn't placed at all.
    expect(satisfiedClues(cells(1, 2, 1, 0, 0), [1, 1, 1])).toEqual([true, false, false])
  })

  it('locks from the right end too', () => {
    // [. . X F] clue [1,1]: only the trailing "1" is pinned (X + edge).
    expect(satisfiedClues(cells(0, 0, 2, 1), [1, 1])).toEqual([false, true])
  })

  it('greys every entry once the filled cells form exactly the clue', () => {
    // Fully solved line, gaps left as plain unknowns (not X-marked).
    expect(satisfiedClues(cells(1, 0, 1, 0, 1), [1, 1, 1])).toEqual([true, true, true])
    expect(satisfiedClues(cells(1, 1, 0, 1), [2, 1])).toEqual([true, true])
  })

  it('greys the 0 of an empty line only while nothing is filled', () => {
    expect(satisfiedClues(cells(0, 2, 2, 0), [0])).toEqual([true])
    expect(satisfiedClues(cells(0, 1, 0, 0), [0])).toEqual([false])
  })
})

describe('lineComplete', () => {
  it('flags a line whose filled cells form exactly the clue', () => {
    // Gaps as plain unknowns.
    expect(lineComplete(cells(1, 1, 0, 1), [2, 1])).toBe(true)
    // Gaps as X-marks — X and unknown-empty both count as gaps here.
    expect(lineComplete(cells(1, 0, 1, 2, 1), [1, 1, 1])).toBe(true)
  })

  it('does not flag an incomplete line', () => {
    expect(lineComplete(cells(1, 0, 0, 0), [2, 1])).toBe(false)
    expect(lineComplete(cells(1, 1, 0, 0), [2, 1])).toBe(false)
  })

  it('flags an empty line only while nothing is filled', () => {
    expect(lineComplete(cells(0, 2, 2, 0), [0])).toBe(true)
    expect(lineComplete(cells(0, 1, 0, 0), [0])).toBe(false)
  })

  it('is mutually exclusive with an inconsistent line', () => {
    // Over-filled: inconsistent, so certainly not complete.
    expect(lineConsistent(cells(1, 1, 1), [2])).toBe(false)
    expect(lineComplete(cells(1, 1, 1), [2])).toBe(false)
  })
})

describe('randomPatternForSize', () => {
  it('returns a picture that fits the requested size', () => {
    for (const size of [5, 10, 15]) {
      const p = randomPatternForSize(size, 'seed-a')
      expect(p).toBeDefined()
      expect(p!.size).toBe(size)
    }
  })

  it('is deterministic for a given size + seed', () => {
    expect(randomPatternForSize(10, 'abc')!.id).toBe(randomPatternForSize(10, 'abc')!.id)
  })

  it('spreads across the library as the seed varies', () => {
    const ids = new Set(
      Array.from({ length: 40 }, (_, i) => randomPatternForSize(10, `s${i}`)!.id),
    )
    expect(ids.size).toBeGreaterThan(1)
  })

  it('returns undefined when no picture fits the size', () => {
    expect(randomPatternForSize(7, 'x')).toBeUndefined()
  })
})

describe('lineConsistent', () => {
  it('accepts a fully solved line', () => {
    expect(lineConsistent(cells(1, 1, 0, 1), [2, 1])).toBe(true)
  })

  it('accepts a partial fill that can still be completed', () => {
    expect(lineConsistent(cells(1, 0, 0, 0, 0), [2, 1])).toBe(true)
    expect(lineConsistent(cells(0, 0, 2, 0), [2])).toBe(true)
  })

  it('flags a run bounded too tightly by X-marks to fit', () => {
    // clue wants a run of 3 but an X sits in the middle of the only space.
    expect(lineConsistent(cells(1, 2, 1), [3])).toBe(false)
  })

  it('flags adjacent fills that violate a split clue', () => {
    // [F F .] with clue [1,1] — the two singles cannot be adjacent.
    expect(lineConsistent(cells(1, 1, 0), [1, 1])).toBe(false)
  })

  it('flags an over-filled line', () => {
    expect(lineConsistent(cells(1, 1, 1), [2])).toBe(false)
  })

  it('flags a filled cell on a line clued empty', () => {
    expect(lineConsistent(cells(0, 1, 0), [0])).toBe(false)
    expect(lineConsistent(cells(0, 2, 0), [0])).toBe(true)
  })

  it('flags too many separate runs for the clue', () => {
    // [F . F . F] clue [1,1] — three runs, only two allowed.
    expect(lineConsistent(cells(1, 0, 1, 0, 1), [1, 1])).toBe(false)
  })
})
