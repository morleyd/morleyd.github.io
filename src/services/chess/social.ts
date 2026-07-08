/**
 * The social simulation — the heart of Wizard Chess. Every piece is a soul with
 * a persistent identity, a mood, and bonds to other souls. As the game unfolds
 * we track each identity through moves, captures, castling, en passant and
 * promotion, evolve moods, form grudges and friendships, and emit ranked
 * `GameEvent`s that the dialogue layer turns into banter.
 *
 * All state lives in a plain `Society` object and every function is pure-ish
 * (mutates the passed society, no globals) so it can be unit-tested and its
 * randomness driven by a seeded RNG for reproducible casts.
 */
import type { Chess } from 'chess.js'
import { strToSeed } from '../seed'
import { PIECE_VALUE } from './assess'
import { ROSTER, BELOVED, DISLIKED } from './profiles'
import { opponent } from './types'
import type { PieceSoul, GameEvent, Color, PieceType, Square, Persona } from './types'

type Rng = () => number

export interface Society {
  souls: Record<string, PieceSoul>
  bySquare: Record<Square, string>
  ply: number
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const clampBond = (v: number) => Math.max(-1, Math.min(1, v))

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** The cast is CONSTANT across games (same characters, deterministic per
 * colour+type from the roster) — only their board positions shuffle. So "the
 * grouchy impatient pawn" is always the same soul; you just never know which
 * square he'll be on. */
function castFor(color: Color, type: PieceType, count: number): Persona[] {
  const pool = ROSTER[type].personas
  const offset = color === 'w' ? 0 : count // give the two armies distinct names
  return Array.from({ length: count }, (_, i) => pool[(offset + i) % pool.length])
}
// A piece's fixed traits are hashed from its identity so the SAME character has
// the same temperament every game, regardless of where it lands.
function fixedSass(color: Color, type: PieceType, index: number): number {
  const h = strToSeed(`sass:${color}${type}${index}`)
  return 0.25 + (h % 1000) / 1000 * 0.6
}

export function createSociety(chess: Chess, rng: Rng): Society {
  const souls: Record<string, PieceSoul> = {}
  const bySquare: Record<Square, string> = {}

  // Group each side's squares by piece type, then shuffle only the positions and
  // deal the fixed cast onto them.
  const squaresByKey: Record<string, Square[]> = {}
  const board = chess.board()
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const cell = board[r][c]
      if (!cell) continue
      const key = (cell.color as Color) + (cell.type as PieceType)
      ;(squaresByKey[key] ||= []).push(cell.square)
    }
  }

  let counter = 0
  for (const key of Object.keys(squaresByKey)) {
    const color = key[0] as Color
    const type = key[1] as PieceType
    const squares = shuffled(squaresByKey[key], rng) // positions shuffle each game
    const cast = castFor(color, type, squares.length) // cast stays the same
    squares.forEach((square, i) => {
      const id = `${color}${type}${counter++}`
      souls[id] = {
        id,
        type,
        color,
        square,
        persona: cast[i],
        stamina: ROSTER[type].stamina,
        sass: fixedSass(color, type, i),
        captured: false,
        mood: { impatience: 0, fear: 0, anger: 0, confidence: 0.4, joy: 0.35 },
        diedAt: null,
        idleFor: 0,
        rants: 0,
        defected: false,
        kills: 0,
        bonds: {},
        avenging: null,
        mourning: null,
        vengefulUntil: -1, // -1 = never; must be > 0 or ply-0 pieces all read "vengeful"
      }
      bySquare[square] = id
    })
  }
  seedBonds(souls, rng)
  return { souls, bySquare, ply: 0 }
}

/** Seeded quirks: everyone adores Dennis, no one warms to Karen, plus a few
 * random crushes and rivalries within each army. */
function seedBonds(souls: Record<string, PieceSoul>, rng: Rng): void {
  const all = Object.values(souls)
  const beloved = all.filter((s) => s.persona.name === BELOVED)
  const disliked = all.filter((s) => s.persona.name === DISLIKED)
  for (const s of all) {
    for (const b of beloved) if (b.id !== s.id) s.bonds[b.id] = 0.6
    for (const d of disliked) if (d.id !== s.id) s.bonds[d.id] = -0.5
  }
  // A crush and a rivalry per side, for texture.
  for (const color of ['w', 'b'] as Color[]) {
    const side = shuffled(
      all.filter((s) => s.color === color),
      rng,
    )
    if (side.length >= 4) {
      side[0].bonds[side[1].id] = clampBond((side[0].bonds[side[1].id] ?? 0) + 0.7) // crush
      side[1].bonds[side[0].id] = clampBond((side[1].bonds[side[0].id] ?? 0) + 0.3)
      side[2].bonds[side[3].id] = clampBond((side[2].bonds[side[3].id] ?? 0) - 0.6) // rivalry
      side[3].bonds[side[2].id] = clampBond((side[3].bonds[side[2].id] ?? 0) - 0.6)
    }
  }
}

interface MoveInfo {
  from: Square
  to: Square
  color: Color
  piece: PieceType
  flags: string
  captured?: PieceType
  promotion?: PieceType
}

/**
 * Fold a played move into the society: relocate the mover's identity, resolve
 * captures/castling/en passant/promotion, age idle pieces, and return the
 * events that resulted (captures, promotions, castles).
 */
export function applyMove(society: Society, move: MoveInfo): GameEvent[] {
  society.ply += 1
  const events: GameEvent[] = []
  const { from, to, flags, captured, promotion } = move
  const moverId = society.bySquare[from]

  // Resolve a capture (en passant victim sits on the mover's own rank).
  let victimSquare: Square | null = null
  if (flags.includes('e')) victimSquare = to[0] + from[1]
  else if (captured) victimSquare = to

  if (victimSquare) {
    const victimId = society.bySquare[victimSquare]
    if (victimId) {
      const victim = society.souls[victimId]
      victim.captured = true
      victim.diedAt = victimSquare
      victim.square = null
      delete society.bySquare[victimSquare]
      events.push({ kind: 'captured', soulId: victimId, otherId: moverId, salience: 66 })

      if (moverId) {
        const mover = society.souls[moverId]
        mover.kills += 1
        mover.mood.confidence = clamp(mover.mood.confidence + 0.2)
        mover.mood.fear = clamp(mover.mood.fear - 0.2)
        mover.mood.anger = clamp(mover.mood.anger - 0.15)
        // Joy only spikes into a visible celebration for a big scalp.
        mover.mood.joy = clamp(mover.mood.joy + (PIECE_VALUE[victim.type] >= 5 ? 0.7 : 0.3))
        events.push({ kind: 'capture', soulId: moverId, otherId: victimId, salience: 60 })

        // The victim's comrades take it personally — grudge + anger toward the
        // killer's identity, sharpened by how fond they were of the fallen.
        let topGriever: PieceSoul | null = null
        let topFondness = 0
        for (const s of Object.values(society.souls)) {
          if (s.captured || s.color !== victim.color || s.id === victimId) continue
          const fondness = Math.max(0, s.bonds[victimId] ?? 0.1)
          s.bonds[moverId] = clampBond((s.bonds[moverId] ?? 0) - 0.35 - fondness * 0.4)
          s.mood.anger = clamp(s.mood.anger + 0.2 + fondness * 0.6)
          if (fondness > topFondness) {
            topFondness = fondness
            topGriever = s
          }
        }
        // Losing a genuine friend tips the closest comrade into a lasting
        // vengeful state (a real power-up, not a one-ply flicker) sworn against
        // the killer, with a line that names the fallen.
        if (topGriever && topFondness >= 0.45) {
          topGriever.avenging = moverId
          topGriever.mourning = victim.persona.name
          topGriever.vengefulUntil = society.ply + 6
          topGriever.mood.anger = 1
          topGriever.mood.fear = 0
          events.push({
            kind: 'vengeance',
            soulId: topGriever.id,
            otherId: moverId,
            salience: 95,
            data: { fallen: victim.persona.name },
          })
        }
      }
    }
  }

  // Relocate the mover.
  if (moverId) {
    const mover = society.souls[moverId]
    delete society.bySquare[from]
    society.bySquare[to] = moverId
    mover.square = to
    mover.idleFor = 0
    mover.rants = 0 // it got to move — no more grievance about being left behind
    mover.mood.impatience = 0
    if (flags.includes('p')) {
      mover.type = promotion ?? 'q'
      mover.mood.joy = 1
      events.push({ kind: 'promotion', soulId: moverId, salience: 78 })
    }
  }

  // Castling drags the rook along.
  if (flags.includes('k') || flags.includes('q')) {
    const rank = from[1]
    const rookFrom = (flags.includes('k') ? 'h' : 'a') + rank
    const rookTo = (flags.includes('k') ? 'f' : 'd') + rank
    const rid = society.bySquare[rookFrom]
    if (rid) {
      delete society.bySquare[rookFrom]
      society.bySquare[rookTo] = rid
      society.souls[rid].square = rookTo
      society.souls[rid].idleFor = 0
    }
    if (moverId) events.push({ kind: 'castle', soulId: moverId, salience: 28 })
  }

  // Everyone who stayed put grows a little more restless; hot moods cool fast so
  // anger/joy are fleeting reactions, not standing states. The mover keeps its
  // freshly-set mood this ply (it just acted) and starts cooling next ply.
  for (const s of Object.values(society.souls)) {
    if (s.captured || s.id === moverId) continue
    s.idleFor += 1
    s.mood.joy = clamp(s.mood.joy - 0.25)
    s.mood.anger = clamp(s.mood.anger - 0.18)
    const restless = (1 - (s.persona.patience ?? 0.5)) * 0.5 + (s.persona.recklessness ?? 0.3) * 0.4
    s.mood.impatience = clamp(s.mood.impatience + restless * 0.14 * (1 - s.stamina * 0.4))
  }

  return events
}

/**
 * Read the position for ambient drama: who is hanging (threatened), who feels
 * safe and grateful (defended), and who is climbing the walls (impatient).
 * Also nudges fear/gratitude moods. Returns candidate events; the dialogue
 * layer decides which actually get voiced.
 */
export function scanBoard(society: Society, chess: Chess): GameEvent[] {
  const events: GameEvent[] = []
  for (const s of Object.values(society.souls)) {
    if (s.captured || !s.square) continue
    const prevFear = s.mood.fear
    const attackers = chess.attackers(s.square, opponent(s.color))
    const defenders = chess.attackers(s.square, s.color)

    if (attackers.length > 0) {
      const underDefended = defenders.length < attackers.length
      s.mood.fear = clamp(s.mood.fear + (underDefended ? 0.28 : 0.1) * (1 - (s.persona.bravery ?? 0.5)))
      if (underDefended) {
        // A trembling queen is funnier than a trembling pawn — weight by value.
        events.push({ kind: 'threatened', soulId: s.id, salience: 34 + PIECE_VALUE[s.type] })
      }
    } else {
      s.mood.fear = clamp(s.mood.fear - 0.2)
      // Only voice gratitude when a piece was genuinely scared and is now safe —
      // otherwise every defended pawn in the opening chirps "safe and sound".
      if (defenders.length > 0) {
        const defId = society.bySquare[defenders[0]]
        if (defId && defId !== s.id) {
          s.bonds[defId] = clampBond((s.bonds[defId] ?? 0) + 0.08)
          if (prevFear > 0.45) events.push({ kind: 'defended', soulId: s.id, otherId: defId, salience: 24 })
        }
      }
    }

    // The restless-rook arc: escalating impatience once a piece has been idle.
    // Each ply spent audibly complaining bumps its rant tally — a breakout only
    // pays off a grievance the player has actually heard a few times.
    if (s.mood.impatience > 0.5 && s.idleFor >= 4) {
      const level = s.mood.impatience > 0.85 ? 3 : s.mood.impatience > 0.68 ? 2 : 1
      s.rants += 1
      events.push({ kind: 'impatient', soulId: s.id, salience: 18 + level * 7, data: { level } })
    }
  }
  return events
}

export const soulAt = (society: Society, square: Square): PieceSoul | null => {
  const id = society.bySquare[square]
  return id ? society.souls[id] : null
}

/** The mood that best characterises a soul right now (for dialogue tone). */
export function dominantMood(soul: PieceSoul): keyof PieceSoul['mood'] | 'calm' {
  const entries = Object.entries(soul.mood) as [keyof PieceSoul['mood'], number][]
  let best: keyof PieceSoul['mood'] | 'calm' = 'calm'
  let bestVal = 0.45 // threshold below which a piece is just "calm"
  for (const [k, v] of entries) {
    if (v > bestVal) {
      bestVal = v
      best = k
    }
  }
  return best
}
