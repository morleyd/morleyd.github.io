/**
 * Headless game state machine for Wizard Chess — chess rules + the social sim +
 * dialogue, plus piece "agency" (resistance, self-suggestion, heckles) and the
 * capped, situational animation decisions. No Vue, no DOM, so all of it is
 * unit-testable with no reactivity caching to go stale.
 *
 * The Vue view is a thin renderer: it reads state, forwards taps, drives the
 * engine, paces the utterances, and plays the animations this module chooses.
 */
import { Chess } from 'chess.js'
import { rngFromSeed } from '../seed'
import { applyMove, createSociety, scanBoard, soulAt, type Society } from './social'
import { createDialogueState, heckleLine, resistLine, speak, suggestLine, type DialogueState } from './dialogue'
import { assessMove, bestOpportunity, PIECE_VALUE } from './assess'
import {
  adjacentSquares,
  applyChaosMove,
  bishopTargets,
  defect,
  jetpackTargets,
  knockOff,
  materialBalance,
} from './chaos'
import { DEFAULT_SETTINGS, type WizardSettings } from './settings'
import type { Color, GameEvent, PieceSoul, PieceType, Square, Utterance } from './types'

export const PLAYER: Color = 'w'
const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')

export type AnimClass = 'tremble' | 'bob' | 'angry' | 'joy'
export type ChaosType = 'disguise' | 'jetpack'
export interface Cue {
  soulId: string
  type: 'shake' | 'hop'
}
interface ChaosOffer {
  type: ChaosType
  from: Square
  targets: Square[]
}
export interface TapResult {
  moved: boolean
  utterances: Utterance[]
  introSoul?: PieceSoul | null
  cue?: Cue // a one-shot body-language reaction (resistance)
}

interface Resist {
  from: Square
  to: Square
  count: number
  need: number // taps required, decided once when this target is first tapped
  sacrifice: boolean
}

/** How many taps a piece demands before it will make a given move. */
export function requiredTaps(soul: PieceSoul, r: ReturnType<typeof assessMove>): number {
  let n = 1
  if (r.sacrifice) n = 2 // anyone balks at being thrown away — once
  const timid = (soul.persona.bravery ?? 0.5) < 0.4
  if (timid && (r.hanging || r.sacrifice)) n = 3 // a coward digs in
  return n
}

export class WizardGame {
  chess: Chess
  society: Society
  selected: Square | null = null
  aiThinking = false
  lastFrom: Square | null = null
  lastTo: Square | null = null
  lastMoverId: string | null = null
  lastMoveRisky = false
  moveLog: string[] = [] // notation for every ply, chaos moves included
  settings: WizardSettings = { ...DEFAULT_SETTINGS }
  private dialogue: DialogueState
  private rng: () => number
  private introduced = new Set<string>()
  private resist: Resist | null = null
  private lastSuggestPly = -99
  private offer: ChaosOffer | null = null
  private usedStunts = new Set<string>() // each stunt fires at most once per game

  constructor(public seed: string) {
    this.chess = new Chess()
    this.rng = rngFromSeed(seed)
    this.society = createSociety(this.chess, this.rng)
    this.dialogue = createDialogueState()
  }

  reset(seed: string, fen?: string) {
    this.seed = seed
    this.chess = fen ? new Chess(fen) : new Chess()
    this.rng = rngFromSeed(seed)
    this.society = createSociety(this.chess, this.rng)
    this.dialogue = createDialogueState()
    this.selected = null
    this.aiThinking = false
    this.lastFrom = null
    this.lastTo = null
    this.lastMoverId = null
    this.lastMoveRisky = false
    this.moveLog = []
    this.introduced.clear()
    this.resist = null
    this.lastSuggestPly = -99
    this.offer = null
    this.usedStunts.clear()
  }

  get turn(): Color {
    return this.chess.turn() as Color
  }
  get gameOver(): boolean {
    return this.chess.isGameOver()
  }
  get canPlay(): boolean {
    return !this.gameOver && !this.aiThinking && this.turn === PLAYER
  }

  soulAt(square: Square): PieceSoul | null {
    return soulAt(this.society, square)
  }

  legalTargets(): Set<Square> {
    if (!this.selected) return new Set()
    const moves = this.chess.moves({ square: this.selected, verbose: true }) as unknown as { to: Square }[]
    return new Set(moves.map((m) => m.to))
  }

  /**
   * Which pieces should animate right now, and how — capped at 2 and gated by
   * genuine, legible cause. This is where "restraint" is enforced centrally.
   */
  animations(): Record<Square, AnimClass> {
    const cap = Math.round(this.settings.animation * 4) // 0 (still) … 4
    if (cap <= 0) return {}
    interface Cand {
      square: Square
      cls: AnimClass
      prio: number
    }
    const cands: Cand[] = []
    for (const s of Object.values(this.society.souls)) {
      if (s.captured || !s.square) continue
      const bravery = s.persona.bravery ?? 0.5
      const reckless = (s.persona.recklessness ?? 0.3) > 0.6 || bravery > 0.65

      // Anger: only a fresh, bonded-loss fume (decays within a ply or two).
      if (s.mood.anger > 0.6) {
        cands.push({ square: s.square, cls: 'angry', prio: 100 + s.mood.anger })
        continue
      }
      // Tremble: under attack AND (cowardly, or completely exposed) — and never
      // for the reckless/bold.
      const attackers = this.chess.attackers(s.square, opp(s.color)).length
      if (attackers > 0 && !reckless) {
        const defenders = this.chess.attackers(s.square, s.color).length
        const cowardly = bravery < 0.4
        const hanging = defenders < attackers
        if (cowardly || hanging) {
          cands.push({ square: s.square, cls: 'tremble', prio: 80 + PIECE_VALUE[s.type] })
          continue
        }
      }
      // Joy: only real highs (a big scalp / promotion), and only for a beat.
      if (s.mood.joy > 0.8) {
        cands.push({ square: s.square, cls: 'joy', prio: 60 + s.mood.joy })
        continue
      }
      // Bob: just the genuinely restless, and (via the cap) only one or two.
      if (s.mood.impatience > 0.72 && s.idleFor >= 6) {
        cands.push({ square: s.square, cls: 'bob', prio: 20 + s.mood.impatience })
      }
    }
    cands.sort((a, b) => b.prio - a.prio)
    const out: Record<Square, AnimClass> = {}
    for (const c of cands.slice(0, cap)) out[c.square] = c.cls
    return out
  }

  private applyAndVoice(move: ReturnType<Chess['move']>): Utterance[] {
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

    this.moveLog.push(move.san)

    // Record who moved and whether it looked risky, for the travel animation.
    this.lastFrom = move.from
    this.lastTo = move.to
    this.lastMoverId = moverId ?? null
    const mover = move.color as Color
    const atk = this.chess.attackers(move.to, opp(mover)).length
    const def = this.chess.attackers(move.to, mover).length
    this.lastMoveRisky = atk > 0 && def < atk

    return speak(
      this.society,
      [...events, ...scanBoard(this.society, this.chess)],
      this.dialogue,
      this.rng,
      this.settings.chatter,
      2,
    )
  }

  /** Handle a tap on a square: select, deselect, resist, or commit a move. */
  playerTap(square: Square): TapResult {
    if (!this.canPlay) return { moved: false, utterances: [] }

    const piece = this.chess.get(square)
    if (piece && piece.color === PLAYER) {
      this.resist = null
      if (this.selected === square) {
        this.selected = null
        this.offer = null
        return { moved: false, utterances: [] }
      }
      this.selected = square
      const soul = this.soulAt(square)
      this.offer = this.computeOffer(square) // maybe a piece offers something wild
      let introSoul: PieceSoul | null = null
      if (soul && !this.introduced.has(soul.id)) {
        this.introduced.add(soul.id)
        introSoul = soul
      }
      return { moved: false, utterances: [], introSoul }
    }

    // A tap on an offered chaos target commits the stunt.
    if (this.offer && this.selected === this.offer.from && this.offer.targets.includes(square)) {
      return this.doChaosMove(square)
    }

    if (this.selected && this.legalTargets().has(square)) {
      const soul = this.soulAt(this.selected)

      // Decide resistance once per target. The Hints/agency scaler dials how
      // often a piece bothers to push back at all.
      if (!this.resist || this.resist.from !== this.selected || this.resist.to !== square) {
        const risk = assessMove(this.chess.fen(), this.selected, square)
        let need = soul ? requiredTaps(soul, risk) : 1
        if (need > 1 && this.rng() > this.settings.agency) need = 1
        this.resist = { from: this.selected, to: square, count: 0, need, sacrifice: risk.sacrifice }
      }
      this.resist.count += 1

      if (this.resist.count < this.resist.need && soul) {
        const kind = this.resist.sacrifice ? 'sacrifice' : 'refuse'
        return {
          moved: false,
          utterances: [
            {
              soulId: soul.id,
              square: this.selected,
              color: soul.color,
              name: soul.persona.name,
              text: resistLine(kind, this.rng),
              tone: kind === 'sacrifice' ? 'afraid' : 'angry',
            },
          ],
          cue: { soulId: soul.id, type: kind === 'sacrifice' ? 'hop' : 'shake' },
        }
      }

      this.resist = null
      try {
        const move = this.chess.move({ from: this.selected, to: square, promotion: 'q' })
        this.selected = null
        this.offer = null
        return { moved: true, utterances: this.applyAndVoice(move) }
      } catch {
        this.selected = null
        return { moved: false, utterances: [] }
      }
    }

    this.selected = null
    this.resist = null
    this.offer = null
    return { moved: false, utterances: [] }
  }

  // ── Chaos: rule-breaking stunts (situational + Chaos-scaler gated) ─────────
  chaosTargets(): Square[] {
    return this.offer ? this.offer.targets : []
  }
  private pick<T>(a: T[]): T {
    return a[Math.floor(this.rng() * a.length)]
  }

  /** Decide (once, at selection) whether this piece offers a wild move. */
  private computeOffer(from: Square): ChaosOffer | null {
    if (this.settings.chaos <= 0) return null
    const piece = this.chess.get(from)
    if (!piece || piece.color !== PLAYER) return null
    const fen = this.chess.fen()

    const build = (type: ChaosType, situational: boolean, gen: () => Square[]): ChaosOffer | null => {
      if (this.usedStunts.has(type) || !situational) return null
      if (this.rng() >= this.settings.chaos) return null // chaos = probability of offering when eligible
      const targets = gen().filter((to) => !!applyChaosMove(new Chess(fen), from, to))
      return targets.length ? { type, from, targets } : null
    }

    if (piece.type === 'r') {
      // A cooped-up rook fancies a diagonal.
      const mobility = this.chess.moves({ square: from }).length
      const o = build('disguise', mobility <= 6, () => bishopTargets(this.chess, from))
      if (o) return o
    }
    if (piece.type === 'n') {
      const leaps = jetpackTargets(this.chess, from)
      const o = build('jetpack', leaps.length > 0, () => leaps)
      if (o) return o
    }
    return null
  }

  private doChaosMove(to: Square): TapResult {
    const offer = this.offer!
    const soul = this.soulAt(offer.from)
    const res = this.relocate(offer.from, to, true)
    this.usedStunts.add(offer.type)
    this.moveLog.push(`🎩 ${offer.type === 'disguise' ? 'R' : 'N'}→${to}`)
    this.offer = null
    this.selected = null
    this.resist = null
    if (!res) return { moved: false, utterances: [] }
    const line = offer.type === 'disguise' ? 'Bishop? Never heard of her.' : 'Hold onto something — JETPACK!'
    const utterances: Utterance[] = soul
      ? [{ soulId: soul.id, square: to, color: soul.color, name: soul.persona.name, text: line, tone: 'gloat' }]
      : []
    utterances.push(
      ...speak(this.society, scanBoard(this.society, this.chess), this.dialogue, this.rng, this.settings.chatter, 1),
    )
    return { moved: true, utterances }
  }

  /** After the engine replies: one spontaneous stunt may occur, either army. */
  spontaneousChaos(): Utterance | null {
    if (!this.canPlay || this.settings.chaos <= 0) return null
    return this.tantrum() ?? this.coldFeet() ?? this.defector()
  }

  /** A terrified piece flees one square (spontaneous, either colour). */
  private coldFeet(): Utterance | null {
    if (this.usedStunts.has('coldfeet')) return null
    const scared = Object.values(this.society.souls)
      .filter((s) => !s.captured && s.square && s.mood.fear >= 0.6)
      .sort((a, b) => b.mood.fear - a.mood.fear)
    for (const s of scared) {
      const sq = s.square as Square
      const rank = Number(sq[1])
      const back = s.color === 'w' ? rank - 1 : rank + 1
      if (back < 1 || back > 8) continue
      if (this.chess.attackers(sq, opp(s.color)).length === 0) continue
      const behind = (sq[0] + back) as Square
      if (this.chess.get(behind)) continue
      if (this.rng() >= this.settings.chaos) continue
      if (!this.relocate(sq, behind, false)) continue
      this.usedStunts.add('coldfeet')
      this.moveLog.push(`🎩 ${behind} (cold feet)`)
      return {
        soulId: s.id,
        square: behind,
        color: s.color,
        name: s.persona.name,
        text: 'Nope! Backing away — nope nope nope.',
        tone: 'afraid',
      }
    }
    return null
  }

  /** A max-rage piece knocks an adjacent enemy clean off the board. */
  private tantrum(): Utterance | null {
    if (this.usedStunts.has('tantrum')) return null
    const furious = Object.values(this.society.souls)
      .filter((s) => !s.captured && s.square && s.mood.anger >= 0.8)
      .sort((a, b) => b.mood.anger - a.mood.anger)
    for (const s of furious) {
      const sq = s.square as Square
      const foes = adjacentSquares(sq).filter((a) => {
        const p = this.chess.get(a)
        return p && p.color !== s.color && p.type !== 'k'
      })
      if (!foes.length) continue
      if (this.rng() >= this.settings.chaos) continue
      const target = this.pick(foes)
      const victimId = this.society.bySquare[target]
      if (!knockOff(this.chess, target)) continue
      if (victimId) {
        const v = this.society.souls[victimId]
        if (v) {
          v.captured = true
          v.square = null
        }
        delete this.society.bySquare[target]
      }
      this.usedStunts.add('tantrum')
      this.lastFrom = null
      this.lastTo = target
      this.lastMoverId = s.id
      this.lastMoveRisky = false
      this.moveLog.push(`🎩 ×${target} (tantrum)`)
      return {
        soulId: s.id,
        square: sq,
        color: s.color,
        name: s.persona.name,
        text: "THAT'S IT — you're OFF the board!",
        tone: 'angry',
      }
    }
    return null
  }

  /** A disgruntled pawn defects to the enemy when White is losing badly. */
  private defector(): Utterance | null {
    if (this.usedStunts.has('defector')) return null
    if (materialBalance(this.chess) > -5) return null
    const pawns = Object.values(this.society.souls)
      .filter((s) => !s.captured && s.color === PLAYER && s.type === 'p' && s.square && (s.persona.obedience ?? 0.6) < 0.55)
      .sort((a, b) => (a.persona.obedience ?? 0.6) - (b.persona.obedience ?? 0.6))
    for (const s of pawns) {
      if (this.rng() >= this.settings.chaos) continue
      const sq = s.square as Square
      if (!defect(this.chess, sq)) continue
      s.color = 'b'
      this.usedStunts.add('defector')
      this.lastFrom = null
      this.lastTo = sq
      this.lastMoverId = s.id
      this.lastMoveRisky = false
      this.moveLog.push(`🎩 ${sq} defects`)
      return {
        soulId: s.id,
        square: sq,
        color: 'b',
        name: s.persona.name,
        text: "Management's been terrible. Hello, other side!",
        tone: 'gloat',
      }
    }
    return null
  }

  /** The enemy sometimes pulls a stunt as its whole turn (replacing the engine
   * move) — so chaos is visible even to a passive player. Returns lines, or null
   * to fall through to a normal engine move. */
  aiChaos(): Utterance[] | null {
    if (this.settings.chaos <= 0 || this.usedStunts.has('aichaos')) return null
    if (this.rng() >= this.settings.chaos * 0.6) return null
    const fen = this.chess.fen()
    for (const s of Object.values(this.society.souls)) {
      if (s.captured || s.color !== 'b' || !s.square) continue
      let targets: Square[] = []
      let type: ChaosType | null = null
      if (s.type === 'n') {
        targets = jetpackTargets(this.chess, s.square)
        type = 'jetpack'
      } else if (s.type === 'r') {
        targets = bishopTargets(this.chess, s.square)
        type = 'disguise'
      }
      if (!type) continue
      targets = targets.filter((to) => !!applyChaosMove(new Chess(fen), s.square as Square, to))
      if (!targets.length) continue
      const caps = targets.filter((to) => this.chess.get(to))
      const to = this.pick(caps.length ? caps : targets)
      this.relocate(s.square, to, true)
      this.usedStunts.add('aichaos')
      this.moveLog.push(`🎩 ${type === 'disguise' ? 'R' : 'N'}→${to} (enemy)`)
      const line = type === 'disguise' ? 'Who says a rook plays it straight?' : "The enemy's got jetpacks too!"
      const utter: Utterance[] = [{ soulId: s.id, square: to, color: 'b', name: s.persona.name, text: line, tone: 'gloat' }]
      utter.push(
        ...speak(this.society, scanBoard(this.society, this.chess), this.dialogue, this.rng, this.settings.chatter, 1),
      )
      return utter
    }
    return null
  }

  /** Move a soul's identity to follow an off-book relocation of the board. */
  private relocate(from: Square, to: Square, flipTurn: boolean): { captured?: PieceType } | null {
    const victimId = this.society.bySquare[to]
    const moverId = this.society.bySquare[from]
    const res = applyChaosMove(this.chess, from, to, flipTurn)
    if (!res) return null
    if (victimId && victimId !== moverId) {
      const v = this.society.souls[victimId]
      if (v) {
        v.captured = true
        v.square = null
      }
      delete this.society.bySquare[to]
    }
    if (moverId) {
      delete this.society.bySquare[from]
      this.society.bySquare[to] = moverId
      const m = this.society.souls[moverId]
      m.square = to
      m.idleFor = 0
    }
    this.lastFrom = from
    this.lastTo = to
    this.lastMoverId = moverId ?? null
    this.lastMoveRisky = false
    return res
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

  /**
   * Occasionally a piece pipes up to volunteer for a strong move, pre-selecting
   * itself. Rare (cooldown + chance). Returns the line, or null.
   */
  suggest(): Utterance | null {
    if (!this.canPlay || this.selected) return null
    if (this.settings.agency <= 0) return null
    if (this.society.ply - this.lastSuggestPly < 8) return null
    if (this.rng() > this.settings.agency * 0.4) return null
    const opp = bestOpportunity(this.chess.fen(), PLAYER)
    if (!opp) return null
    const soul = this.soulAt(opp.from)
    if (!soul) return null
    this.selected = opp.from
    this.lastSuggestPly = this.society.ply
    const reckless = (soul.persona.recklessness ?? 0.3) > 0.6
    return {
      soulId: soul.id,
      square: opp.from,
      color: soul.color,
      name: soul.persona.name,
      text: suggestLine(reckless, this.rng),
      tone: 'gloat',
    }
  }

  /** A prod from the most restless piece when the player dawdles. */
  idleHeckle(): Utterance | null {
    if (!this.canPlay) return null
    const mine = Object.values(this.society.souls).filter((s) => !s.captured && s.color === PLAYER && s.square)
    if (!mine.length) return null
    mine.sort((a, b) => b.mood.impatience - a.mood.impatience)
    const s = mine[0]
    return {
      soulId: s.id,
      square: s.square,
      color: s.color,
      name: s.persona.name,
      text: heckleLine(this.rng),
      tone: 'angry',
    }
  }

  /** Names of the player's surviving pieces (for the share message). */
  livingCast(): string[] {
    return Object.values(this.society.souls)
      .filter((s) => !s.captured && s.color === PLAYER)
      .map((s) => s.persona.name)
  }
}
