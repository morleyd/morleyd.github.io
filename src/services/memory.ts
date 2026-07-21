/**
 * Memory games logic — two modes share this module:
 *  - "match": a concentration board of face-down pairs to flip and match.
 *  - "simon": a growing color sequence to watch and repeat.
 * Pure and RNG-injectable so both are testable and (for match) shareable.
 */

/** Build a shuffled deck of `pairs` matching pairs (values 0..pairs-1, twice). */
export function buildDeck(pairs: number, rng: () => number): number[] {
  const deck: number[] = []
  for (let v = 0; v < pairs; v += 1) deck.push(v, v)
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/**
 * Given the two indices a player flipped in a match game, whether they match.
 * (Trivial, but centralizes the rule and guards against same-index double taps.)
 */
export function isMatch(deck: number[], a: number, b: number): boolean {
  return a !== b && deck[a] === deck[b]
}

/** Star rating (1-3) for finishing a match board in `moves` flips-of-pairs. */
export function matchStars(pairs: number, moves: number): number {
  // A perfect game takes `pairs` moves. Allow some slack per tier.
  if (moves <= pairs + Math.ceil(pairs * 0.34)) return 3
  if (moves <= pairs + Math.ceil(pairs * 1.0)) return 2
  return 1
}

export const SIMON_PADS = 4

/**
 * Difficulty presets. Each picks how many Match pairs the board has and how
 * many Simon pads light up; the view lets the player switch between them and
 * starts a fresh game at the chosen size.
 */
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface MemorySize {
  /** Number of matching pairs in the Match board (deck is twice this). */
  pairs: number
  /** Number of Simon pads (sequence values are drawn from 0..pads-1). */
  pads: number
}

export const DIFFICULTIES: Record<Difficulty, MemorySize> = {
  easy: { pairs: 6, pads: 4 },
  medium: { pairs: 8, pads: 4 },
  hard: { pairs: 10, pads: 6 },
}

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard']

/** Largest pad count any difficulty uses — the view needs a color/tone for each. */
export const MAX_SIMON_PADS = Math.max(...DIFFICULTY_ORDER.map((d) => DIFFICULTIES[d].pads))

/** Number of Simon pads for a difficulty. */
export function padsFor(difficulty: Difficulty): number {
  return DIFFICULTIES[difficulty].pads
}

/** Number of Match pairs for a difficulty. */
export function pairsFor(difficulty: Difficulty): number {
  return DIFFICULTIES[difficulty].pairs
}

/**
 * Append one random pad to a Simon sequence. Pads defaults to the classic 4,
 * but a harder difficulty passes a larger count so more pads come into play.
 */
export function extendSequence(
  sequence: number[],
  rng: () => number,
  pads: number = SIMON_PADS,
): number[] {
  return [...sequence, Math.floor(rng() * pads)]
}

/**
 * Check a player's in-progress Simon input against the target sequence.
 * Returns 'ok' (correct so far, more to go), 'complete' (matched the whole
 * round), or 'wrong' (a mistake).
 */
export function checkSimon(sequence: number[], input: number[]): 'ok' | 'complete' | 'wrong' {
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== sequence[i]) return 'wrong'
  }
  return input.length === sequence.length ? 'complete' : 'ok'
}
