/**
 * Headless game state machine for Wizard Chess — chess rules + the social sim +
 * dialogue, with turn/selection logic, but no Vue and no DOM. Keeping this out
 * of the component means the "can I move this piece" logic is plain and unit
 * testable, with no reactivity caching to go stale (the original move bug).
 *
 * The Vue view is a thin renderer: it reads state, forwards taps, drives the
 * engine, and paces the returned utterances.
 */
import { Chess } from 'chess.js'
import { rngFromSeed } from '../seed'
import { applyMove, createSociety, dominantMood, scanBoard, soulAt, type Society } from './social'
import { createDialogueState, speak, type DialogueState } from './dialogue'
import type { Color, GameEvent, PieceSoul, Square, Utterance } from './types'

export const PLAYER: Color = 'w'

export interface TapResult {
  /** True if a piece actually moved (the caller should then run the AI reply). */
  moved: boolean
  utterances: Utterance[]
  /** A newly-selected piece meeting the player for the first time. */
  introSoul?: PieceSoul | null
}

type ChessMove = ReturnType<Chess['move']>

export class WizardGame {
  chess: Chess
  society: Society
  selected: Square | null = null
  aiThinking = false
  lastFrom: Square | null = null
  lastTo: Square | null = null
  private dialogue: DialogueState
  private rng: () => number
  private introduced = new Set<string>()

  constructor(public seed: string) {
    this.chess = new Chess()
    this.rng = rngFromSeed(seed)
    this.society = createSociety(this.chess, this.rng)
    this.dialogue = createDialogueState()
  }

  reset(seed: string) {
    this.seed = seed
    this.chess = new Chess()
    this.rng = rngFromSeed(seed)
    this.society = createSociety(this.chess, this.rng)
    this.dialogue = createDialogueState()
    this.selected = null
    this.aiThinking = false
    this.lastFrom = null
    this.lastTo = null
    this.introduced.clear()
  }

  get turn(): Color {
    return this.chess.turn() as Color
  }
  get gameOver(): boolean {
    return this.chess.isGameOver()
  }
  /** May the human act right now? (Their turn, game live, engine idle.) */
  get canPlay(): boolean {
    return !this.gameOver && !this.aiThinking && this.turn === PLAYER
  }

  soulAt(square: Square): PieceSoul | null {
    return soulAt(this.society, square)
  }
  moodAt(square: Square): string {
    const s = soulAt(this.society, square)
    return s ? dominantMood(s) : 'calm'
  }

  legalTargets(): Set<Square> {
    if (!this.selected) return new Set()
    const moves = this.chess.moves({ square: this.selected, verbose: true }) as unknown as { to: Square }[]
    return new Set(moves.map((m) => m.to))
  }

  private applyAndVoice(move: ChessMove): Utterance[] {
    const events: GameEvent[] = applyMove(this.society, {
      from: move.from,
      to: move.to,
      color: move.color as Color,
      piece: move.piece as PieceSoul['type'],
      flags: move.flags,
      captured: move.captured as PieceSoul['type'] | undefined,
      promotion: move.promotion as PieceSoul['type'] | undefined,
    })
    const moverId = this.society.bySquare[move.to]
    if (this.chess.isCheckmate() && moverId) events.push({ kind: 'checkmate', soulId: moverId, salience: 120 })
    else if (this.chess.isCheck() && moverId) events.push({ kind: 'check', soulId: moverId, salience: 54 })
    this.lastFrom = move.from
    this.lastTo = move.to
    return speak(this.society, [...events, ...scanBoard(this.society, this.chess)], this.dialogue, this.rng, 2)
  }

  /** Handle a tap on a square: select, deselect, or commit a move. */
  playerTap(square: Square): TapResult {
    if (!this.canPlay) return { moved: false, utterances: [] }

    const piece = this.chess.get(square)
    if (piece && piece.color === PLAYER) {
      if (this.selected === square) {
        this.selected = null
        return { moved: false, utterances: [] }
      }
      this.selected = square
      const soul = this.soulAt(square)
      let introSoul: PieceSoul | null = null
      if (soul && !this.introduced.has(soul.id)) {
        this.introduced.add(soul.id)
        introSoul = soul
      }
      return { moved: false, utterances: [], introSoul }
    }

    if (this.selected && this.legalTargets().has(square)) {
      try {
        const move = this.chess.move({ from: this.selected, to: square, promotion: 'q' })
        this.selected = null
        return { moved: true, utterances: this.applyAndVoice(move) }
      } catch {
        this.selected = null
      }
      return { moved: false, utterances: [] }
    }

    this.selected = null
    return { moved: false, utterances: [] }
  }

  /** Apply the engine's chosen move for the AI side. */
  aiApply(move: { from: Square; to: Square; promotion?: string }): Utterance[] {
    try {
      const m = this.chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' })
      return this.applyAndVoice(m)
    } catch {
      return []
    }
  }

  /** Names of the player's surviving pieces (for the share message). */
  livingCast(): string[] {
    return Object.values(this.society.souls)
      .filter((s) => !s.captured && s.color === PLAYER)
      .map((s) => s.persona.name)
  }
}
