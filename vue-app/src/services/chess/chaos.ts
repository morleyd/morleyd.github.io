/**
 * Rule-breaking "chaos" moves. chess.js only knows legal chess, so an off-book
 * move (a rook sliding like a bishop, a knight with a jetpack) is applied by
 * editing the board and reloading a freshly-built, still-legal FEN. The game
 * then continues normally — the engine just sees a new position.
 */
import { Chess } from 'chess.js'
import { PIECE_VALUE } from './assess'
import type { Color, PieceType, Square } from './types'

const FILES = 'abcdefgh'
const toSquare = (f: number, r: number): Square => FILES[f] + (r + 1)
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8
const coords = (s: Square): [number, number] => [s.charCodeAt(0) - 97, Number(s[1]) - 1]

/** Recompute castling rights purely from where the kings and rooks sit. Slightly
 * generous (ignores prior movement history) but always yields a valid FEN. */
function computeCastling(c: Chess): string {
  let s = ''
  const wk = c.get('e1')
  if (wk?.type === 'k' && wk.color === 'w') {
    if (c.get('h1')?.type === 'r' && c.get('h1')?.color === 'w') s += 'K'
    if (c.get('a1')?.type === 'r' && c.get('a1')?.color === 'w') s += 'Q'
  }
  const bk = c.get('e8')
  if (bk?.type === 'k' && bk.color === 'b') {
    if (c.get('h8')?.type === 'r' && c.get('h8')?.color === 'b') s += 'k'
    if (c.get('a8')?.type === 'r' && c.get('a8')?.color === 'b') s += 'q'
  }
  return s || '-'
}

/**
 * Build + validate the edited position on a throwaway, and only commit it to the
 * live board `c` once the FEN is known-legal — so a rejected stunt (e.g. an
 * illegal self-check, or a pawn shoved onto a promotion rank) can never leave the
 * live game half-mutated and corrupted.
 */
function commit(c: Chess, edited: Chess, turn: Color): boolean {
  const fen = `${edited.fen().split(' ')[0]} ${turn} ${computeCastling(edited)} - 0 1`
  try {
    new Chess(fen) // validate without touching `c`
  } catch {
    return false
  }
  c.load(fen)
  return true
}

/**
 * Apply an off-book relocation of any geometry. Returns the captured piece type
 * (or undefined), or null if the result would be an illegal position.
 */
export function applyChaosMove(
  c: Chess,
  from: Square,
  to: Square,
  flipTurn = true,
): { captured?: PieceType } | null {
  const piece = c.get(from)
  if (!piece) return null
  const target = c.get(to)
  if (target?.type === 'k') return null // never capture a king
  const captured = target?.type

  const edited = new Chess(c.fen())
  edited.remove(from)
  if (target) edited.remove(to)
  edited.put({ type: piece.type, color: piece.color }, to)

  const turn: Color = flipTurn ? (piece.color === 'w' ? 'b' : 'w') : piece.color
  return commit(c, edited, turn) ? { captured } : null
}

/** Flip a piece's allegiance in place (the defector). Keeps the current turn. */
export function defect(c: Chess, square: Square): boolean {
  const p = c.get(square)
  if (!p || p.type === 'k') return false
  const edited = new Chess(c.fen())
  edited.remove(square)
  edited.put({ type: p.type, color: p.color === 'w' ? 'b' : 'w' }, square)
  return commit(c, edited, c.turn())
}

/** Knock a piece clean off the board (the tantrum). Keeps the current turn. */
export function knockOff(c: Chess, square: Square): boolean {
  const p = c.get(square)
  if (!p || p.type === 'k') return false
  const edited = new Chess(c.fen())
  edited.remove(square)
  return commit(c, edited, c.turn())
}

/** Material balance in points, positive = White ahead. */
export function materialBalance(c: Chess): number {
  let s = 0
  for (const row of c.board()) for (const cell of row) if (cell) s += (cell.color === 'w' ? 1 : -1) * PIECE_VALUE[cell.type]
  return s
}

/** The up-to-8 squares around a square. */
export function adjacentSquares(sq: Square): Square[] {
  const [f, r] = coords(sq)
  const out: Square[] = []
  for (let df = -1; df <= 1; df += 1)
    for (let dr = -1; dr <= 1; dr += 1) {
      if (!df && !dr) continue
      if (onBoard(f + df, r + dr)) out.push(toSquare(f + df, r + dr))
    }
  return out
}

/** Diagonal (bishop-style) destinations for a disguised rook — slides, stopping
 * at the first blocker (capturable if it's a non-king enemy). */
export function bishopTargets(c: Chess, from: Square): Square[] {
  const [f, r] = coords(from)
  const me = c.get(from)?.color
  const out: Square[] = []
  for (const [df, dr] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    let nf = f + df
    let nr = r + dr
    while (onBoard(nf, nr)) {
      const s = toSquare(nf, nr)
      const p = c.get(s)
      if (!p) out.push(s)
      else {
        if (p.color !== me && p.type !== 'k') out.push(s)
        break
      }
      nf += df
      nr += dr
    }
  }
  return out
}

/** Extended leaps for a jetpack knight — jumps (ignores blockers) to squares
 * further out than a normal knight, landing on empty or a non-king enemy. */
export function jetpackTargets(c: Chess, from: Square): Square[] {
  const [f, r] = coords(from)
  const me = c.get(from)?.color
  const base = [
    [3, 1],
    [1, 3],
    [3, 2],
    [2, 3],
    [2, 2],
    [3, 3],
  ]
  const seen = new Set<string>()
  const out: Square[] = []
  for (const [a, b] of base) {
    for (const df of [a, -a]) {
      for (const dr of [b, -b]) {
        const nf = f + df
        const nr = r + dr
        if (!onBoard(nf, nr)) continue
        const s = toSquare(nf, nr)
        if (seen.has(s)) continue
        seen.add(s)
        const p = c.get(s)
        if (p && (p.color === me || p.type === 'k')) continue
        out.push(s)
      }
    }
  }
  return out
}
