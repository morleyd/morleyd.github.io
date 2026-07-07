/**
 * Wizard Chess opponent — an iterative-deepening negamax search with
 * alpha-beta pruning, MVV-LVA move ordering and a quiescence search on
 * captures. Pure module (no DOM/worker globals) so it runs in tests too; it is
 * driven off the main thread by engine.worker.ts.
 *
 * Deliberately self-contained (no WASM): GitHub Pages can't set the COOP/COEP
 * headers a threaded Stockfish build needs, and for a character-driven game a
 * time-boxed negamax is plenty strong. The wrapper interface is engine-agnostic,
 * so this can be swapped for Stockfish later without touching callers.
 */
import { Chess } from 'chess.js'
import type { EngineMove, PieceType } from './types'

const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }
const MATE = 1_000_000

// Piece-square tables (white's view, rank 8 first), adapted from Sunfish.
const PST_W: Record<PieceType, number[][]> = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  r: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  k: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
}
const PST_B: Record<PieceType, number[][]> = {
  p: PST_W.p.slice().reverse(),
  n: PST_W.n.slice().reverse(),
  b: PST_W.b.slice().reverse(),
  r: PST_W.r.slice().reverse(),
  q: PST_W.q.slice().reverse(),
  k: PST_W.k.slice().reverse(),
}

/** Static evaluation, always from white's perspective (centipawns). */
function evaluate(chess: Chess): number {
  const board = chess.board()
  let score = 0
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const sq = board[r][c]
      if (!sq) continue
      const t = sq.type as PieceType
      const base = VALUE[t] + (sq.color === 'w' ? PST_W[t][r][c] : PST_B[t][r][c])
      score += sq.color === 'w' ? base : -base
    }
  }
  return score
}

interface OrderedMove extends EngineMove {
  captured?: string
  piece: string
  score: number
}

function orderedMoves(chess: Chess): OrderedMove[] {
  const moves = chess.moves({ verbose: true }) as unknown as OrderedMove[]
  for (const m of moves) {
    // MVV-LVA: prize the fattest victim taken by the cheapest attacker.
    let s = 0
    if (m.captured) s += 10 * VALUE[m.captured as PieceType] - VALUE[m.piece as PieceType]
    if (m.promotion) s += VALUE[m.promotion as PieceType]
    m.score = s
  }
  moves.sort((a, b) => b.score - a.score)
  return moves
}

/** Quiescence: only follow captures so we don't stop mid-exchange. */
function quiesce(chess: Chess, alpha: number, beta: number, sign: number): number {
  const standPat = sign * evaluate(chess)
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  for (const m of orderedMoves(chess)) {
    if (!m.captured && !m.promotion) continue
    chess.move(m)
    const score = -quiesce(chess, -beta, -alpha, -sign)
    chess.undo()
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

let deadline = 0
class TimeUp extends Error {}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, sign: number, ply: number): number {
  if ((ply & 3) === 0 && Date.now() > deadline) throw new TimeUp()

  if (chess.isCheckmate()) return -MATE + ply // mated side to move; prefer later mates
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) return 0
  if (depth <= 0) return quiesce(chess, alpha, beta, sign)

  let best = -Infinity
  for (const m of orderedMoves(chess)) {
    chess.move(m)
    const score = -negamax(chess, depth - 1, -beta, -alpha, -sign, ply + 1)
    chess.undo()
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

interface LevelSpec {
  maxDepth: number
  movetime: number
  blunder: number // chance of ignoring the search and playing a random legal move
}
const LEVELS: LevelSpec[] = [
  { maxDepth: 1, movetime: 100, blunder: 0.55 }, // 1 — makes real mistakes
  { maxDepth: 2, movetime: 200, blunder: 0.3 }, // 2
  { maxDepth: 3, movetime: 400, blunder: 0.1 }, // 3
  { maxDepth: 4, movetime: 800, blunder: 0.0 }, // 4
  { maxDepth: 5, movetime: 1400, blunder: 0.0 }, // 5
  { maxDepth: 6, movetime: 2500, blunder: 0.0 }, // 6 — plays it straight
]

export function chooseMove(fen: string, level: number): EngineMove | null {
  const chess = new Chess(fen)
  const legal = orderedMoves(chess)
  if (legal.length === 0) return null

  const spec = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, level - 1))]
  const sign = chess.turn() === 'w' ? 1 : -1

  if (spec.blunder > 0 && Math.random() < spec.blunder) {
    const m = legal[Math.floor(Math.random() * legal.length)]
    return { from: m.from, to: m.to, promotion: m.promotion }
  }

  deadline = Date.now() + spec.movetime
  let best: OrderedMove = legal[0]

  // Iterative deepening — keep the best move from the last fully-searched depth.
  for (let depth = 1; depth <= spec.maxDepth; depth += 1) {
    let alpha = -Infinity
    const beta = Infinity
    let localBest = legal[0]
    let localBestScore = -Infinity
    try {
      for (const m of legal) {
        chess.move(m)
        const score = -negamax(chess, depth - 1, -beta, -alpha, -sign, 1)
        chess.undo()
        if (score > localBestScore) {
          localBestScore = score
          localBest = m
        }
        if (score > alpha) alpha = score
      }
      best = localBest
      // Re-sort so the previous best is searched first next iteration.
      legal.sort((a, b) => (a === best ? -1 : b === best ? 1 : 0))
    } catch (e) {
      if (e instanceof TimeUp) break
      throw e
    }
  }
  return { from: best.from, to: best.to, promotion: best.promotion }
}
