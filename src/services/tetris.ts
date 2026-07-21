/**
 * Tetris core logic — pure and framework-free so it can be unit tested and
 * driven by a seeded RNG. The view owns the render/animation/gravity loop; this
 * module handles the board, pieces, rotation (with simple wall kicks), line
 * clears, the 7-bag randomizer, and scoring.
 */

export const COLS = 10
export const ROWS = 20

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

/** 0 = empty; 1..7 map to piece colors in COLOR_ORDER. */
export type Board = number[]

export interface Piece {
  type: PieceType
  rotation: number
  x: number
  y: number
}

export const COLOR_ORDER: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
const colorIndex = (type: PieceType): number => COLOR_ORDER.indexOf(type) + 1

/** Spawn-orientation matrices; other rotations are derived by rotating these. */
const SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
}

const rotateCW = (m: number[][]): number[][] => {
  const n = m.length
  return m.map((row, r) => row.map((_, c) => m[n - 1 - c][r]))
}

/** The matrix for a piece type at a given rotation (0..3), normalized to 0..3. */
export function matrixFor(type: PieceType, rotation: number): number[][] {
  let m = SHAPES[type]
  const times = ((rotation % 4) + 4) % 4
  for (let i = 0; i < times; i += 1) m = rotateCW(m)
  return m
}

/** Absolute board cells a piece currently occupies. */
export function pieceCells(piece: Piece): Array<{ x: number; y: number }> {
  const m = matrixFor(piece.type, piece.rotation)
  const cells: Array<{ x: number; y: number }> = []
  for (let r = 0; r < m.length; r += 1) {
    for (let c = 0; c < m[r].length; c += 1) {
      if (m[r][c]) cells.push({ x: piece.x + c, y: piece.y + r })
    }
  }
  return cells
}

/** True if the piece overlaps a wall, the floor, or a settled block. */
export function collides(board: Board, piece: Piece): boolean {
  for (const { x, y } of pieceCells(piece)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true
    if (y >= 0 && board[y * COLS + x]) return true // y < 0 is above the board — allowed
  }
  return false
}

/** A fresh piece centered at the top, with its first filled row at y = 0. */
export function spawnPiece(type: PieceType): Piece {
  const m = SHAPES[type]
  const x = Math.floor((COLS - m[0].length) / 2)
  const topOffset = m.findIndex((row) => row.some((v) => v))
  return { type, rotation: 0, x, y: -topOffset || 0 } // avoid -0
}

/** Lock a piece into a new board (cells above the top are dropped). */
export function merge(board: Board, piece: Piece): Board {
  const next = board.slice()
  const color = colorIndex(piece.type)
  for (const { x, y } of pieceCells(piece)) {
    if (y >= 0) next[y * COLS + x] = color
  }
  return next
}

/**
 * Indices of rows that are completely filled — the rows a clear will remove.
 * The view uses this to flash those rows before collapsing them.
 */
export function fullRows(board: Board): number[] {
  const rows: number[] = []
  for (let r = 0; r < ROWS; r += 1) {
    let full = true
    for (let c = 0; c < COLS; c += 1) {
      if (!board[r * COLS + c]) {
        full = false
        break
      }
    }
    if (full) rows.push(r)
  }
  return rows
}

/** Remove full rows, dropping everything above down. Returns the count cleared. */
export function clearLines(board: Board): { board: Board; cleared: number } {
  const rows: number[][] = []
  for (let r = 0; r < ROWS; r += 1) rows.push(board.slice(r * COLS, (r + 1) * COLS))
  const kept = rows.filter((row) => row.some((c) => c === 0))
  const cleared = ROWS - kept.length
  const empty = Array.from({ length: cleared }, () => Array<number>(COLS).fill(0))
  return { board: [...empty, ...kept].flat(), cleared }
}

/**
 * Rotate with basic wall kicks: try the rotation in place, then nudged left/right
 * (and, for I, two cells) so rotations near a wall still succeed. Returns the
 * kicked piece, or null if no offset is legal.
 */
export function rotate(board: Board, piece: Piece, dir: 1 | -1): Piece | null {
  const rotation = ((piece.rotation + dir) % 4 + 4) % 4
  const kicks = [0, -1, 1, -2, 2]
  for (const dx of kicks) {
    const candidate: Piece = { ...piece, rotation, x: piece.x + dx }
    if (!collides(board, candidate)) return candidate
  }
  return null
}

/** Fisher–Yates shuffle of the 7 pieces (a "bag") using the given RNG. */
export function createBag(rng: () => number): PieceType[] {
  const bag = COLOR_ORDER.slice()
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

/** Row at which the piece would land if dropped straight down (its ghost). */
export function dropRow(board: Board, piece: Piece): Piece {
  let p = piece
  while (!collides(board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 }
  return p
}

const LINE_SCORES = [0, 100, 300, 500, 800]
/** Points for clearing `lines` rows at the given level (1-based). */
export function lineScore(lines: number, level: number): number {
  return (LINE_SCORES[lines] ?? 0) * level
}

/** Gravity interval (ms per row) — faster as the level climbs. */
export function gravityMs(level: number): number {
  return Math.max(80, 800 - (level - 1) * 70)
}

export const emptyBoard = (): Board => Array<number>(COLS * ROWS).fill(0)
