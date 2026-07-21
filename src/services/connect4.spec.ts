import { describe, it, expect } from 'vitest'
import {
  AI,
  COLS,
  PLAYER,
  ROWS,
  type Board,
  bestMove,
  dropRow,
  emptyBoard,
  evaluate,
  findWin,
  isFull,
  isWin,
  play,
  validMoves,
} from './connect4'

const rng = () => 0.42 // fixed, deterministic tie-breaks

/** Drop discs down the given columns, alternating or as specified. */
const withMoves = (cols: Array<[number, 1 | 2]>): Board => {
  let b = emptyBoard()
  for (const [col, who] of cols) b = play(b, col, who)
  return b
}

describe('dropRow / play', () => {
  it('stacks discs from the bottom up', () => {
    let b = emptyBoard()
    expect(dropRow(b, 3)).toBe(ROWS - 1)
    b = play(b, 3, PLAYER)
    expect(dropRow(b, 3)).toBe(ROWS - 2)
    expect(b[(ROWS - 1) * COLS + 3]).toBe(PLAYER)
  })
  it('reports a full column as -1', () => {
    let b = emptyBoard()
    for (let i = 0; i < ROWS; i += 1) b = play(b, 0, PLAYER)
    expect(dropRow(b, 0)).toBe(-1)
    expect(validMoves(b)).not.toContain(0)
  })
})

describe('findWin / isWin', () => {
  it('detects a horizontal four', () => {
    const b = withMoves([[0, PLAYER], [1, PLAYER], [2, PLAYER], [3, PLAYER]])
    expect(isWin(b, PLAYER)).toBe(true)
    expect(findWin(b, PLAYER)).toHaveLength(4)
  })
  it('detects a vertical four', () => {
    const b = withMoves([[5, AI], [5, AI], [5, AI], [5, AI]])
    expect(isWin(b, AI)).toBe(true)
  })
  it('detects a diagonal four', () => {
    // Build a ↘/↗ staircase.
    const b = withMoves([
      [0, PLAYER],
      [1, AI], [1, PLAYER],
      [2, AI], [2, AI], [2, PLAYER],
      [3, AI], [3, AI], [3, AI], [3, PLAYER],
    ])
    expect(isWin(b, PLAYER)).toBe(true)
  })
  it('returns null / false when there is no four', () => {
    const b = withMoves([[0, PLAYER], [1, PLAYER], [2, PLAYER]])
    expect(findWin(b, PLAYER)).toBeNull()
    expect(isWin(b, PLAYER)).toBe(false)
  })
})

describe('isFull', () => {
  it('is true only when every cell is filled', () => {
    expect(isFull(emptyBoard())).toBe(false)
    const full = new Array(COLS * ROWS).fill(PLAYER) as Board
    expect(isFull(full)).toBe(true)
  })
})

describe('evaluate', () => {
  it('prefers center control', () => {
    const center = play(emptyBoard(), 3, AI)
    const edge = play(emptyBoard(), 0, AI)
    expect(evaluate(center, AI)).toBeGreaterThan(evaluate(edge, AI))
  })
  it('is antisymmetric between players (required for negamax)', () => {
    const b = withMoves([[3, AI], [3, PLAYER], [2, AI], [4, PLAYER], [2, AI]])
    expect(evaluate(b, AI)).toBe(-evaluate(b, PLAYER))
  })
})

describe('bestMove', () => {
  it('takes an immediate winning move', () => {
    // AI has three in a row along the bottom (cols 0-2); playing col 3 wins.
    const b = withMoves([[0, AI], [1, AI], [2, AI]])
    expect(bestMove(b, 'hard', rng)).toBe(3)
  })

  it('blocks the opponent’s immediate win', () => {
    // Player threatens to complete cols 0-3 on the bottom row; AI must play col 3.
    const b = withMoves([[0, PLAYER], [1, PLAYER], [2, PLAYER]])
    expect(bestMove(b, 'hard', rng)).toBe(3)
  })

  it('returns a legal move on an empty board', () => {
    const move = bestMove(emptyBoard(), 'medium', rng)
    expect(validMoves(emptyBoard())).toContain(move)
  })

  it('never returns a full column', () => {
    let b = emptyBoard()
    for (let i = 0; i < ROWS; i += 1) b = play(b, 3, i % 2 === 0 ? PLAYER : AI)
    const move = bestMove(b, 'hard', rng)
    expect(move).not.toBe(3)
    expect(validMoves(b)).toContain(move)
  })
})
