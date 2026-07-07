/** Shared types for Wizard Chess. */

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Color = 'w' | 'b'
export type Square = string // e.g. "e4"

/** A concrete engine move request/response. */
export interface EngineMove {
  from: Square
  to: Square
  promotion?: 'q' | 'r' | 'b' | 'n'
}

/** Personality traits, all in [0, 1]. Not every type uses every trait. */
export interface Traits {
  bravery?: number
  obedience?: number
  intelligence?: number
  patience?: number
  recklessness?: number
  wisdom?: number
  charisma?: number
}

/** A named persona drawn from a piece type's roster. */
export interface Persona extends Traits {
  name: string
  intro: string
}

/** A live piece with an identity that persists as it moves and promotes. */
export interface PieceSoul {
  id: string // stable identity for the life of the piece
  type: PieceType // current type (changes on promotion)
  color: Color
  square: Square | null // null once captured
  persona: Persona
  stamina: number
  captured: boolean
  /** Mood scalars in [0, 1]. */
  mood: {
    impatience: number
    fear: number
    anger: number
    confidence: number
    joy: number
  }
  idleFor: number // plies since this piece last moved
  kills: number // enemies this piece has captured
  /** id -> feeling in [-1, 1]. Positive = fondness, negative = grudge. */
  bonds: Record<string, number>
}

/** Something noteworthy that happened on a ply, ranked by salience. */
export interface GameEvent {
  kind:
    | 'intro'
    | 'capture'
    | 'captured' // this soul was taken
    | 'check'
    | 'checkmate'
    | 'promotion'
    | 'threatened'
    | 'defended'
    | 'missed-attack'
    | 'impatient'
    | 'castle'
    | 'gloat'
  soulId: string
  otherId?: string // victim / attacker / ally, depending on kind
  salience: number
  data?: Record<string, number | string>
}

/** A line of dialogue to surface to the player. */
export interface Utterance {
  soulId: string
  square: Square | null
  color: Color
  name: string
  text: string
  tone: 'calm' | 'gloat' | 'sad' | 'afraid' | 'angry' | 'warm' | 'joy'
}
