/**
 * Rule-breaking "chaos" moves. chess.js only knows legal chess, so an off-book
 * move (a rook sliding like a bishop, a knight with a jetpack) is applied by
 * editing the board and reloading a freshly-built, still-legal FEN. The game
 * then continues normally — the engine just sees a new position.
 */
import { Chess } from 'chess.js'
import type { PieceType, Square } from './types'

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
 * Apply an off-book relocation of any geometry. Mutates `c`. Returns the captured
 * piece type (or undefined), or null if the result would be an illegal position
 * (e.g. it leaves the mover's own king in check — chess.js rejects the FEN).
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

  c.remove(from)
  if (target) c.remove(to)
  c.put({ type: piece.type, color: piece.color }, to)

  const placement = c.fen().split(' ')[0]
  const turn = flipTurn ? (piece.color === 'w' ? 'b' : 'w') : piece.color
  const fen = `${placement} ${turn} ${computeCastling(c)} - 0 1`
  try {
    c.load(fen)
  } catch {
    return null
  }
  return { captured }
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
