import { describe, it, expect } from 'vitest'
import {
  COLS,
  ROWS,
  clearLines,
  collides,
  createBag,
  dropRow,
  emptyBoard,
  gravityMs,
  lineScore,
  matrixFor,
  merge,
  pieceCells,
  rotate,
  spawnPiece,
  type Board,
} from './tetris'

describe('matrixFor', () => {
  it('rotates 4 times back to the original', () => {
    expect(matrixFor('T', 4)).toEqual(matrixFor('T', 0))
    expect(matrixFor('T', -1)).toEqual(matrixFor('T', 3))
  })
  it('rotates the T piece clockwise', () => {
    // spawn T: top-middle filled; after one CW turn the stem points right.
    expect(matrixFor('T', 1)).toEqual([
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ])
  })
})

describe('spawnPiece', () => {
  it('places the first filled row at y = 0 and centers horizontally', () => {
    const t = spawnPiece('T')
    expect(t.y).toBe(0)
    expect(pieceCells(t).some((c) => c.y === 0)).toBe(true)
    const i = spawnPiece('I')
    expect(i.y).toBe(-1) // I's filled row is row index 1
    expect(pieceCells(i).every((c) => c.y === 0)).toBe(true)
  })
})

describe('collides', () => {
  it('detects the floor and walls', () => {
    const board = emptyBoard()
    expect(collides(board, { type: 'O', rotation: 0, x: 0, y: ROWS - 1 })).toBe(true)
    expect(collides(board, { type: 'O', rotation: 0, x: -1, y: 0 })).toBe(true)
    expect(collides(board, { type: 'O', rotation: 0, x: COLS - 1, y: 0 })).toBe(true)
  })
  it('allows a piece partly above the board', () => {
    expect(collides(emptyBoard(), { type: 'I', rotation: 0, x: 3, y: -1 })).toBe(false)
  })
  it('detects overlap with a settled block', () => {
    const board = emptyBoard()
    board[5 * COLS + 4] = 1
    expect(collides(board, { type: 'O', rotation: 0, x: 4, y: 4 })).toBe(true)
  })
})

describe('merge + clearLines', () => {
  it('locks a piece into the board', () => {
    const board = merge(emptyBoard(), { type: 'O', rotation: 0, x: 0, y: 0 })
    expect(board[0]).toBeGreaterThan(0)
    expect(board[1]).toBeGreaterThan(0)
    expect(board[COLS]).toBeGreaterThan(0)
  })
  it('clears a full row and drops the rows above', () => {
    const board = emptyBoard()
    for (let c = 0; c < COLS; c += 1) board[(ROWS - 1) * COLS + c] = 1
    board[(ROWS - 2) * COLS + 3] = 2 // a lone block above the full row
    const { board: next, cleared } = clearLines(board)
    expect(cleared).toBe(1)
    expect(next.slice((ROWS - 1) * COLS)).toEqual([0, 0, 0, 2, 0, 0, 0, 0, 0, 0])
    expect(next.slice(0, COLS).every((v) => v === 0)).toBe(true)
  })
  it('clears four rows at once (a tetris)', () => {
    let board = emptyBoard()
    for (let r = ROWS - 4; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) board[r * COLS + c] = 1
    }
    const res = clearLines(board)
    expect(res.cleared).toBe(4)
    expect(res.board.every((v) => v === 0)).toBe(true)
    board = res.board
    expect(board).toHaveLength(COLS * ROWS)
  })
})

describe('rotate', () => {
  it('wall-kicks off the left wall', () => {
    // An I piece flush against the left wall, rotated vertical then back to
    // horizontal, should kick right rather than fail.
    const board = emptyBoard()
    const vertical = { type: 'I' as const, rotation: 1, x: -2, y: 0 }
    const kicked = rotate(board, vertical, 1)
    expect(kicked).not.toBeNull()
    expect(pieceCells(kicked!).every((c) => c.x >= 0 && c.x < COLS)).toBe(true)
  })
  it('returns null when no kick offset is legal', () => {
    // Fill the whole board so any rotation collides everywhere.
    const board: Board = Array<number>(COLS * ROWS).fill(1)
    expect(rotate(board, { type: 'T', rotation: 0, x: 3, y: 5 }, 1)).toBeNull()
  })
})

describe('dropRow', () => {
  it('drops a piece to the floor on an empty board', () => {
    const ghost = dropRow(emptyBoard(), spawnPiece('O'))
    expect(Math.max(...pieceCells(ghost).map((c) => c.y))).toBe(ROWS - 1)
  })
  it('lands on top of settled blocks', () => {
    const board = emptyBoard()
    for (let c = 0; c < COLS; c += 1) board[(ROWS - 1) * COLS + c] = 1
    const ghost = dropRow(board, spawnPiece('O'))
    expect(Math.max(...pieceCells(ghost).map((c) => c.y))).toBe(ROWS - 2)
  })
})

describe('createBag', () => {
  it('is a permutation of all seven pieces', () => {
    const bag = createBag(() => 0.42)
    expect([...bag].sort()).toEqual(['I', 'J', 'L', 'O', 'S', 'T', 'Z'])
  })
})

describe('scoring', () => {
  it('scales line scores by level', () => {
    expect(lineScore(1, 1)).toBe(100)
    expect(lineScore(4, 1)).toBe(800)
    expect(lineScore(4, 3)).toBe(2400)
    expect(lineScore(0, 5)).toBe(0)
  })
  it('speeds up with level and floors at 80ms', () => {
    expect(gravityMs(1)).toBe(800)
    expect(gravityMs(2)).toBe(730)
    expect(gravityMs(99)).toBe(80)
  })
})
