/**
 * Lightweight, synchronous move-risk assessment via chess.js attackers — no
 * engine round-trip. Powers piece agency: cowardly refusal, sacrifice recoil,
 * "I see an opportunity" self-selection, and the reluctance of a risky move's
 * travel animation.
 */
import { Chess } from 'chess.js'
import type { Color, Square } from './types'

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

export interface MoveRisk {
  gain: number // material captured by the move
  risk: number // material likely lost after the obvious recapture (>=0)
  hanging: boolean // lands attacked and under-defended, for a net loss
  sacrifice: boolean // clearly loses ~2+ points of material
}

/** Evaluate the consequences of a (legal) move using a crude static exchange. */
export function assessMove(fen: string, from: Square, to: Square): MoveRisk {
  const c = new Chess(fen)
  let played
  try {
    played = c.move({ from, to, promotion: 'q' })
  } catch {
    return { gain: 0, risk: 0, hanging: false, sacrifice: false }
  }
  const me = played.color as Color
  const enemy: Color = me === 'w' ? 'b' : 'w'
  const gain = played.captured ? PIECE_VALUE[played.captured] : 0

  const attackers = c.attackers(to, enemy)
  if (attackers.length === 0) return { gain, risk: 0, hanging: false, sacrifice: false }

  const defenders = c.attackers(to, me)
  const movedVal = PIECE_VALUE[c.get(to)!.type]
  const cheapestAttacker = Math.min(...attackers.map((s) => PIECE_VALUE[c.get(s)!.type]))
  const canRecapture = defenders.length > 0

  // If they take and we (maybe) take back the cheapest attacker.
  const loss = movedVal - gain - (canRecapture ? cheapestAttacker : 0)
  const underDefended = defenders.length < attackers.length
  const hanging = underDefended && movedVal - gain > 0
  const sacrifice = loss >= 2
  return { gain, risk: Math.max(0, loss), hanging, sacrifice }
}

export interface Opportunity extends MoveRisk {
  from: Square
  to: Square
  value: number // gain minus risk
}

/** The strongest clearly-winning capture available to `color`, if any (value >= 3). */
export function bestOpportunity(fen: string, color: Color): Opportunity | null {
  const c = new Chess(fen)
  if (c.turn() !== color) return null
  let best: Opportunity | null = null
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured) continue
    const r = assessMove(fen, m.from, m.to)
    const value = r.gain - r.risk
    if (value >= 3 && (!best || value > best.value)) best = { from: m.from, to: m.to, value, ...r }
  }
  return best
}

/** The move that loses the most material — for a piece's confident *bad* advice. */
export function worstBlunder(fen: string, color: Color): Opportunity | null {
  const c = new Chess(fen)
  if (c.turn() !== color) return null
  let worst: Opportunity | null = null
  for (const m of c.moves({ verbose: true })) {
    const r = assessMove(fen, m.from, m.to)
    const value = r.gain - r.risk // negative = throws material away
    if (value <= -3 && (!worst || value < worst.value)) worst = { from: m.from, to: m.to, value, ...r }
  }
  return worst
}
