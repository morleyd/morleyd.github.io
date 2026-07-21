import { describe, it, expect } from 'vitest'
import { move, spawn, canMove, hasWon, emptyCells, SIZE, type Tile } from './game2048'

/** Build tiles from a 2D value grid (0 = empty). IDs are row-major cell indices. */
const fromGrid = (rows: number[][]): Tile[] => {
  const tiles: Tile[] = []
  rows.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value) tiles.push({ id: r * SIZE + c, value, row: r, col: c })
    }),
  )
  return tiles
}

/** Render tiles back to a 2D value grid for easy assertions. */
const toGrid = (tiles: Tile[]): number[][] => {
  const g = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0))
  for (const t of tiles) g[t.row][t.col] = t.value
  return g
}

describe('move', () => {
  it('slides tiles to the wall without merging distinct values', () => {
    const { tiles, moved, gained } = move(fromGrid([
      [2, 0, 0, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')
    expect(toGrid(tiles)[0]).toEqual([2, 4, 0, 0])
    expect(moved).toBe(true)
    expect(gained).toBe(0)
  })

  it('merges equal adjacent tiles and scores the sum', () => {
    const { tiles, gained, consumed } = move(fromGrid([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')
    expect(toGrid(tiles)[0]).toEqual([4, 0, 0, 0])
    expect(gained).toBe(4)
    expect(consumed).toHaveLength(1)
  })

  it('merges only once per tile per move (2 2 2 2 → 4 4)', () => {
    const { tiles, gained } = move(fromGrid([
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')
    expect(toGrid(tiles)[0]).toEqual([4, 4, 0, 0])
    expect(gained).toBe(8)
  })

  it('merges toward the direction of travel (4 2 2 → left → 4 4)', () => {
    const { tiles } = move(fromGrid([
      [4, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')
    expect(toGrid(tiles)[0]).toEqual([4, 4, 0, 0])
  })

  it('reports no move when nothing can shift', () => {
    const { moved } = move(fromGrid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]), 'left')
    expect(moved).toBe(false)
  })

  it('does not mutate the input tiles', () => {
    const input = fromGrid([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    const snapshot = input.map((t) => ({ ...t }))
    move(input, 'left')
    expect(input).toEqual(snapshot)
  })

  it('slides down correctly', () => {
    const { tiles } = move(fromGrid([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'down')
    expect(toGrid(tiles)[3][0]).toBe(4)
  })
})

describe('spawn', () => {
  it('fills an empty cell with a 2 or 4', () => {
    const tiles = fromGrid([[2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 0], [2, 2, 2, 2]])
    const t = spawn(tiles, () => 0.5, 99)
    expect(t).not.toBeNull()
    expect(t!.row).toBe(2)
    expect(t!.col).toBe(3)
    expect([2, 4]).toContain(t!.value)
  })

  it('returns null on a full board', () => {
    const full = fromGrid(Array.from({ length: 4 }, () => [2, 2, 2, 2]))
    expect(spawn(full, () => 0, 1)).toBeNull()
  })

  it('spawns a 4 only when the value roll is >= 0.9', () => {
    const board = fromGrid([[0, 0, 0, 0], [2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]])
    expect(spawn(board, () => 0.95, 1)!.value).toBe(4)
    expect(spawn(board, () => 0.1, 1)!.value).toBe(2)
  })
})

describe('canMove', () => {
  it('is true with empty cells', () => {
    expect(canMove(fromGrid([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]))).toBe(true)
  })
  it('is true on a full board with an available merge', () => {
    expect(canMove(fromGrid([[2, 2, 4, 8], [4, 8, 16, 32], [2, 4, 8, 16], [4, 8, 16, 32]]))).toBe(true)
  })
  it('is false on a full board with no merges (game over)', () => {
    expect(canMove(fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]))).toBe(false)
  })
})

describe('hasWon', () => {
  it('detects reaching 2048', () => {
    expect(hasWon(fromGrid([[2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]))).toBe(true)
    expect(hasWon(fromGrid([[1024, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]))).toBe(false)
  })
})

describe('emptyCells', () => {
  it('counts and orders empty cells row-major', () => {
    const cells = emptyCells(fromGrid([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2]]))
    expect(cells).toHaveLength(14)
    expect(cells[0]).toEqual({ row: 0, col: 1 })
  })
})
