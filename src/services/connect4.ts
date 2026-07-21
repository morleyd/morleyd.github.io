/**
 * Connect 4 engine — board rules plus a negamax (minimax) AI with alpha-beta
 * pruning. Pure and deterministic (AI tie-breaks use a passed-in RNG), so the
 * bot is unit testable.
 *
 * Board: 7 columns × 6 rows, stored row-major from the TOP (index = row*COLS +
 * col, row 0 is the top). 0 = empty, 1 = player, 2 = AI.
 */

export const COLS = 7
export const ROWS = 6
export const EMPTY = 0
export const PLAYER = 1
export const AI = 2

export type Disc = 0 | 1 | 2
export type Board = Disc[]

export const emptyBoard = (): Board => new Array(COLS * ROWS).fill(EMPTY) as Board

/** Lowest empty row in a column, or -1 if the column is full. */
export function dropRow(board: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r * COLS + col] === EMPTY) return r
  }
  return -1
}

export const validMoves = (board: Board): number[] => {
  const cols: number[] = []
  for (let c = 0; c < COLS; c += 1) if (dropRow(board, c) !== -1) cols.push(c)
  return cols
}

/** Drop a disc for `who` into `col`, returning a new board (no-op copy if full). */
export function play(board: Board, col: number, who: Disc): Board {
  const r = dropRow(board, col)
  if (r === -1) return board.slice() as Board
  const next = board.slice() as Board
  next[r * COLS + col] = who
  return next
}

const DIRECTIONS: Array<[number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
]

/** The four-in-a-row winning cells for `who`, or null if none. */
export function findWin(board: Board, who: Disc): number[] | null {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (board[r * COLS + c] !== who) continue
      for (const [dr, dc] of DIRECTIONS) {
        const cells = [r * COLS + c]
        let rr = r + dr
        let cc = c + dc
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr * COLS + cc] === who) {
          cells.push(rr * COLS + cc)
          if (cells.length === 4) return cells
          rr += dr
          cc += dc
        }
      }
    }
  }
  return null
}

export const isWin = (board: Board, who: Disc): boolean => findWin(board, who) !== null
export const isFull = (board: Board): boolean => board.every((v) => v !== EMPTY)

/** Count length-4 windows and weight them — the heart of the heuristic. */
function scoreWindow(cells: Disc[], who: Disc): number {
  const opp = who === AI ? PLAYER : AI
  let mine = 0
  let theirs = 0
  for (const v of cells) {
    if (v === who) mine += 1
    else if (v === opp) theirs += 1
  }
  if (mine > 0 && theirs > 0) return 0 // blocked window, worthless
  if (mine === 4) return 10000
  if (mine === 3) return 50
  if (mine === 2) return 10
  if (theirs === 3) return -80 // value blocking a bit higher than building
  if (theirs === 2) return -10
  return 0
}

/** Static evaluation of a non-terminal board from `who`'s perspective. */
export function evaluate(board: Board, who: Disc): number {
  let score = 0
  // Center control is valuable.
  const center = Math.floor(COLS / 2)
  for (let r = 0; r < ROWS; r += 1) {
    if (board[r * COLS + center] === who) score += 6
  }
  // All length-4 windows.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      for (const [dr, dc] of DIRECTIONS) {
        const er = r + 3 * dr
        const ec = c + 3 * dc
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue
        const cells: Disc[] = []
        for (let k = 0; k < 4; k += 1) cells.push(board[(r + k * dr) * COLS + (c + k * dc)])
        score += scoreWindow(cells, who)
      }
    }
  }
  return score
}

/** Move-ordering: try center columns first for better alpha-beta pruning. */
const orderedMoves = (board: Board): number[] => {
  const center = (COLS - 1) / 2
  return validMoves(board).sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
}

interface Search {
  score: number
  col: number
}

/**
 * Negamax with alpha-beta pruning. Returns the best score (from `who`'s view)
 * and the column to play. Terminal wins are scored with depth so the AI prefers
 * faster wins and slower losses.
 */
function negamax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  who: Disc,
  rng: () => number,
): Search {
  const opp = who === AI ? PLAYER : AI
  if (isWin(board, opp)) return { score: -100000 - depth, col: -1 } // opp just won
  const moves = orderedMoves(board)
  if (moves.length === 0) return { score: 0, col: -1 } // draw
  if (depth === 0) return { score: evaluate(board, who), col: -1 }

  let bestScore = -Infinity
  let bestCol = moves[0]
  let a = alpha
  for (const col of moves) {
    const child = play(board, col, who)
    let score: number
    if (isWin(child, who)) {
      score = 100000 + depth // immediate win — best possible, prefer sooner
    } else {
      score = -negamax(child, depth - 1, -beta, -a, opp, rng).score
    }
    if (score > bestScore || (score === bestScore && rng() < 0.5)) {
      bestScore = score
      bestCol = col
    }
    if (bestScore > a) a = bestScore
    if (a >= beta) break // prune
  }
  return { score: bestScore, col: bestCol }
}

export type Level = 'easy' | 'medium' | 'hard'
const DEPTH: Record<Level, number> = { easy: 2, medium: 4, hard: 6 }

/**
 * Choose the AI's column. On easy, occasionally plays a random legal move so it
 * feels beatable; otherwise it searches to the level's depth. Always takes an
 * immediate win and blocks an immediate loss (via the search).
 */
export function bestMove(board: Board, level: Level, rng: () => number): number {
  const moves = validMoves(board)
  if (moves.length === 0) return -1
  if (level === 'easy' && rng() < 0.25) {
    return moves[Math.floor(rng() * moves.length)]
  }
  const { col } = negamax(board, DEPTH[level], -Infinity, Infinity, AI, rng)
  return col === -1 ? moves[0] : col
}
