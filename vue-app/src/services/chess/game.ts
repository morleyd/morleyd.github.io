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
import {
  badAdviceLine,
  chatBanter,
  chatCloser,
  chatOpener,
  chatReply,
  createDialogueState,
  enemyStuntAnnounce,
  enemyStuntCommit,
  heckleLine,
  postGameLine,
  loseFaithLine,
  resistLine,
  smallTalkLine,
  speak,
  suggestLine,
  type DialogueState,
} from './dialogue'
import { assessMove, bestOpportunity, PIECE_VALUE, worstBlunder } from './assess'
import {
  adjacentSquares,
  applyChaosMove,
  bishopTargets,
  defect,
  jetpackTargets,
  knockOff,
  materialBalance,
} from './chaos'
import { DEFAULT_SETTINGS, DEFAULT_TRUST, type WizardSettings } from './settings'
import type { Color, GameEvent, MoveEntry, PieceSoul, PieceType, Square, Utterance } from './types'

export const PLAYER: Color = 'w'
const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')
const nowMs = () => Date.now()

export type AnimClass = 'tremble' | 'bob' | 'angry' | 'joy'
export type ChaosType = 'disguise' | 'jetpack' | 'rage'
export interface Cue {
  soulId: string
  type: 'shake' | 'hop'
}
interface ChaosOffer {
  type: ChaosType
  from: Square
  targets: Square[]
}
/** A lingering board marker after any stunt, so the player can read what just
 * happened where (the view renders it for several seconds). */
export interface StuntFx {
  kind: ChaosType | 'tantrum' | 'breakout' | 'coldfeet' | 'defect' | 'telegraph'
  from: Square | null
  to: Square
  seq: number // bumps every new fx so the view can restart its linger timer
}
/** The enemy's staged stunt: announced first, committed a beat later. */
export interface AiChaosPlan {
  type: 'disguise' | 'jetpack'
  soulId: string
  from: Square
  to: Square
  announce: Utterance
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
  moveLog: MoveEntry[] = [] // timestamped notation for every ply, chaos included
  graveyard: string[] = [] // soul ids in the order they fell ("the box")
  fx: StuntFx | null = null // lingering marker for the most recent stunt
  deathFx: 'drag' | 'spiral' = 'drag' // how the next capture leaves: dragged to the box, or (trample only) spiralling out
  smack: { square: Square; word: string; seq: number } | null = null // comic burst on violence (POW!)
  trust = DEFAULT_TRUST // team's trust in the player (0–100); persists across games
  settings: WizardSettings = { ...DEFAULT_SETTINGS }
  private startTime = nowMs()
  private dialogue: DialogueState
  private rng: () => number
  private introduced = new Set<string>()
  private resist: Resist | null = null
  private lastSuggestPly = -99
  private offer: ChaosOffer | null = null
  private usedStunts = new Set<string>() // each stunt fires at most once per game
  private spooked: { soulId: string; home: Square; until: number } | null = null
  private enrageSeen: Record<string, number> = {} // soulId -> ply its max rage was first visible

  constructor(public seed: string) {
    this.chess = new Chess()
    this.rng = rngFromSeed(seed)
    this.society = createSociety(this.chess, this.rng)
    this.dialogue = createDialogueState()
  }

  /** ms since this game started — the shared clock for move + chat timestamps. */
  now(): number {
    return nowMs() - this.startTime
  }
  private logMove(san: string, side: Color, chaos: boolean) {
    this.moveLog.push({ san, ts: this.now(), side, chaos })
  }
  private setTrust(v: number) {
    this.trust = Math.max(0, Math.min(100, v))
  }
  /** Nudge the team's trust by the quality of the player's just-made move. */
  private scoreTrust(before: string, from: Square, to: Square) {
    const r = assessMove(before, from, to)
    let d = 0
    if (r.sacrifice) d -= 6
    else if (r.hanging) d -= 4
    else if (r.gain - r.risk >= 2) d += 3
    else d += 0.5
    const chance = bestOpportunity(before, PLAYER)
    if (chance && r.gain < chance.gain - 1) d -= 2 // left free material on the board
    this.setTrust(this.trust + d)
  }
  /**
   * Trust reacts hard to material swings, either side's move: the army takes
   * heart when the general wins a piece or presses up the board, and loses faith
   * — sharply, and more the more beloved the fallen — when a comrade dies on your
   * watch. Returns a "losing faith" line from a grieving comrade when the drop is
   * steep, so the meter's slide has a voice. */
  private trustFromMove(move: ReturnType<Chess['move']>, events: GameEvent[]): Utterance | null {
    const mover = move.color as Color
    const cap = events.find((e) => e.kind === 'captured')
    if (!cap) {
      // Pressing pieces up the board earns the general a little faith.
      if (mover === PLAYER) {
        const adv = Number(move.to[1]) - Number(move.from[1])
        if (adv >= 1) this.setTrust(this.trust + 0.4 + (adv >= 2 ? 0.4 : 0))
      }
      return null
    }
    const victim = this.society.souls[cap.soulId]
    const val = victim ? PIECE_VALUE[victim.type] : move.captured ? PIECE_VALUE[move.captured] : 3
    if (mover === PLAYER) {
      this.setTrust(this.trust + 2 + val * 0.7) // you won material — the ranks cheer up
      return null
    }
    // A comrade has fallen on your watch. Loss aversion: it stings more than a
    // capture cheers, and the closer the survivors were to the fallen, the worse.
    let grief = 0
    let mourner: PieceSoul | null = null
    let topBond = 0
    if (victim) {
      for (const s of Object.values(this.society.souls)) {
        if (s.captured || s.color !== PLAYER || s.id === victim.id) continue
        const fond = Math.max(0, s.bonds[victim.id] ?? 0)
        grief += fond
        if (fond > topBond) {
          topBond = fond
          mourner = s
        }
      }
    }
    this.setTrust(this.trust - (3 + val * 1.1 + grief * 1.5))
    // A bonded survivor voices flagging faith when the loss really hurt.
    if (mourner && topBond >= 0.4 && this.trust < 60 && this.rng() < 0.6) {
      return {
        soulId: mourner.id,
        square: mourner.square as Square,
        color: mourner.color,
        name: mourner.persona.name,
        text: loseFaithLine(this.rng),
        tone: 'angry',
      }
    }
    return null
  }

  reset(seed: string, fen?: string) {
    this.seed = seed
    // A supplied position may be malformed (it can come from a URL) — fall back
    // to the standard opening rather than throwing.
    let chess = new Chess()
    if (fen) {
      try {
        chess = new Chess(fen)
      } catch {
        chess = new Chess()
      }
    }
    this.chess = chess
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
    this.graveyard = []
    this.startTime = nowMs()
    this.introduced.clear()
    this.resist = null
    this.lastSuggestPly = -99
    this.offer = null
    this.usedStunts.clear()
    this.spooked = null
    this.enrageSeen = {}
    this.fx = null
    this.deathFx = 'drag'
    this.smack = null
  }

  private fxSeq = 0
  private setFx(kind: StuntFx['kind'], from: Square | null, to: Square) {
    this.fx = { kind, from, to, seq: ++this.fxSeq }
  }

  /** Comic-book violence: every capture bursts a "POW!" at the square. The word
   * sells the smash the pieces can't act out (no cannon-and-rubble art needed). */
  private static SMACK_WORDS = ['POW!', 'WHAM!', 'SMASH!', 'THWACK!', 'CRUNCH!', 'BAM!', 'CLANG!']
  private smackSeq = 0
  private setSmack(square: Square, word?: string) {
    this.smack = {
      square,
      word: word ?? this.pick(WizardGame.SMACK_WORDS),
      seq: ++this.smackSeq,
    }
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

      // Anger: the lasting vengeful state (a friend was killed) — persists for
      // its whole window so the red actually means something.
      if (s.vengefulUntil >= this.society.ply) {
        cands.push({ square: s.square, cls: 'angry', prio: 110 })
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
    this.deathFx = 'drag' // an ordinary capture is hauled off to the box
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

    // Material swings move trust the most; capture the "losing faith" voice too.
    const faith = this.trustFromMove(move, events)
    // Game verdict swings trust several notches (the side to move is the loser).
    if (this.chess.isCheckmate()) this.setTrust(this.trust + (this.chess.turn() !== PLAYER ? 15 : -15))
    else if (this.chess.isDraw() || this.chess.isStalemate()) this.setTrust(this.trust - 3)

    this.logMove(move.san, move.color as Color, false)
    for (const e of events) if (e.kind === 'captured') this.graveyard.push(e.soulId)
    if (events.some((e) => e.kind === 'captured')) this.setSmack(move.to)
    if (this.spooked && this.spooked.soulId === moverId) this.spooked = null // it left on its own

    // Record who moved and whether it looked risky, for the travel animation.
    this.lastFrom = move.from
    this.lastTo = move.to
    this.lastMoverId = moverId ?? null
    const mover = move.color as Color
    const atk = this.chess.attackers(move.to, opp(mover)).length
    const def = this.chess.attackers(move.to, mover).length
    this.lastMoveRisky = atk > 0 && def < atk

    const said = speak(
      this.society,
      [...events, ...scanBoard(this.society, this.chess)],
      this.dialogue,
      this.rng,
      this.settings.chatter,
      2,
    )
    if (faith) said.push(faith)
    return said
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

    // Coax a spooked piece back to its post (free, keeps your turn).
    if (this.selected && square === this.coaxTarget()) {
      const soul = this.soulAt(this.selected)
      const from = this.selected
      this.spooked = null
      this.selected = null
      if (!soul || !this.relocate(from, square, false)) return { moved: false, utterances: [] }
      return {
        moved: false,
        utterances: [
          {
            soulId: soul.id,
            square,
            color: soul.color,
            name: soul.persona.name,
            text: 'Well… since you asked nicely. Back to my post.',
            tone: 'warm',
          },
        ],
      }
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
        // Low trust → pieces push back more; high trust → they defer to you.
        const resistChance = this.settings.agency * (1.4 - this.trust / 100)
        if (need > 1 && this.rng() > resistChance) need = 1
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
      const before = this.chess.fen()
      const from = this.selected
      try {
        const move = this.chess.move({ from, to: square, promotion: 'q' })
        this.selected = null
        this.offer = null
        this.scoreTrust(before, from, square)
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

  /** Persistent per-piece states the view badges with an icon. */
  states(): Record<Square, 'vengeful' | 'spooked'> {
    const out: Record<Square, 'vengeful' | 'spooked'> = {}
    for (const s of Object.values(this.society.souls)) {
      if (s.captured || !s.square) continue
      if (s.vengefulUntil >= this.society.ply) out[s.square] = 'vengeful'
    }
    if (this.spooked && this.society.ply <= this.spooked.until) {
      const s = this.society.souls[this.spooked.soulId]
      if (s && !s.captured && s.square) out[s.square] = 'spooked'
    }
    return out
  }

  /** If a spooked piece is selected within its window, the square you can coax
   * it back to (canon: talking a reluctant piece back to its post). */
  coaxTarget(): Square | null {
    if (!this.spooked || !this.selected) return null
    if (this.society.ply > this.spooked.until) return null
    return this.society.bySquare[this.selected] === this.spooked.soulId ? this.spooked.home : null
  }

  /** Decide (once, at selection) whether this piece offers a wild move. */
  private computeOffer(from: Square): ChaosOffer | null {
    if (this.settings.chaos <= 0) return null
    const piece = this.chess.get(from)
    if (!piece || piece.color !== PLAYER) return null
    const fen = this.chess.fen()

    // Rage payoff: a piece still in its vengeful window that has an enemy right
    // beside it can be unleashed for a rage-strike (knock the neighbour clean off
    // the board). Makes the red state actually pay off.
    const soul = this.soulAt(from)
    if (soul && soul.vengefulUntil >= this.society.ply && !this.usedStunts.has('rage') && this.rng() < this.settings.chaos) {
      const foes = adjacentSquares(from).filter((a) => {
        const p = this.chess.get(a)
        return !!p && p.color !== PLAYER && p.type !== 'k'
      })
      if (foes.length) return { type: 'rage', from, targets: foes }
    }

    // A stunt is only *offered* at a dramatic moment: it captures, gives check, or
    // the piece is escaping an attack on its own square. Idle repositioning never
    // triggers an offer — so chaos reads as a real turning point, not noise.
    const underAttack = this.chess.attackers(from, opp(PLAYER)).length > 0
    const build = (type: ChaosType, situational: boolean, gen: () => Square[]): ChaosOffer | null => {
      if (this.usedStunts.has(type) || !situational) return null
      if (this.rng() >= this.settings.chaos) return null // chaos = probability of offering when eligible
      const targets: Square[] = []
      for (const to of gen()) {
        const trial = new Chess(fen)
        if (!applyChaosMove(trial, from, to)) continue // must be a legal resulting position
        const captures = !!this.chess.get(to) // targets only land on empty or enemy squares
        const givesCheck = trial.isCheck() // turn has flipped → the enemy is the side in check
        if (captures || givesCheck || underAttack) targets.push(to)
      }
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

  /** The kind of stunt currently on offer (so the view can style rage targets
   * as a red strike ring rather than a purple move ring). */
  chaosOfferType(): ChaosType | null {
    return this.offer ? this.offer.type : null
  }

  private doChaosMove(to: Square): TapResult {
    const offer = this.offer!
    if (offer.type === 'rage') return this.doRageStrike(offer.from, to)
    const soul = this.soulAt(offer.from)
    this.deathFx = 'drag'
    const res = this.relocate(offer.from, to, true)
    this.usedStunts.add(offer.type)
    if (res) this.setFx(offer.type, offer.from, to)
    this.logMove(`${offer.type === 'disguise' ? 'R' : 'N'}→${to}`, PLAYER, true)
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

  /** The rage payoff: a vengeful piece smashes an adjacent enemy clean off the
   * board. The strike is its move for the turn (turn flips), the rage is spent,
   * and the red state clears — so the vengeance arc actually resolves. */
  private doRageStrike(from: Square, target: Square): TapResult {
    const soul = this.soulAt(from)
    const victimId = this.society.bySquare[target]
    this.deathFx = 'drag'
    const ok = knockOff(this.chess, target, true) // the strike IS the turn → flip
    this.usedStunts.add('rage')
    if (ok) this.setFx('rage', from, target)
    this.offer = null
    this.selected = null
    this.resist = null
    if (!ok) return { moved: false, utterances: [] }
    if (victimId) {
      const v = this.society.souls[victimId]
      if (v) {
        v.captured = true
        v.square = null
      }
      delete this.society.bySquare[target]
      this.graveyard.push(victimId)
    }
    this.setSmack(target, 'SMASH!') // rage always smashes
    // The strike lands from `from`; the rager doesn't move, the victim vanishes.
    this.lastFrom = null
    this.lastTo = target
    this.lastMoverId = soul?.id ?? null
    this.lastMoveRisky = false
    this.logMove(`×${target} (rage)`, PLAYER, true)
    if (soul) {
      soul.avenging = null
      soul.vengefulUntil = -1 // rage spent — the red clears
      soul.mood.anger = Math.max(0, soul.mood.anger - 0.6)
      soul.kills += 1
    }
    const utterances: Utterance[] = soul
      ? [{ soulId: soul.id, square: from, color: soul.color, name: soul.persona.name, text: 'For the fallen — GET OFF MY BOARD!', tone: 'angry' }]
      : []
    utterances.push(
      ...speak(this.society, scanBoard(this.society, this.chess), this.dialogue, this.rng, this.settings.chatter, 1),
    )
    return { moved: true, utterances }
  }

  /** After the engine replies: one spontaneous stunt may occur, either army.
   * Never while the player is holding a piece — the board must not shift under
   * a selection in progress. */
  spontaneousChaos(): Utterance | null {
    if (!this.canPlay || this.settings.chaos <= 0) return null
    if (this.selected) return null
    return this.tantrum() ?? this.breakout() ?? this.coldFeet() ?? this.defector()
  }

  /** A piece stuck behind its own pawn for a very long time finally charges up
   * its file — a real slide of a few ranks (how many depends on the room above).
   * The pawn is shoved one rank further ahead of it, or, when there's no room to
   * give, trampled clean off the board. Spontaneous flavor for the boxed-in. */
  private breakout(): Utterance | null {
    if (this.usedStunts.has('breakout')) return null
    // Only a piece whose impatience the player has *heard* (the escalating
    // rant lines fire from ~0.68) gets to erupt — the charge pays off a story
    // the player was already following, instead of arriving from nowhere.
    const stuck = Object.values(this.society.souls)
      .filter((s) => !s.captured && s.square && s.type !== 'p' && s.type !== 'k' && s.idleFor >= 12 && s.mood.impatience >= 0.7)
      .sort((a, b) => b.mood.impatience - a.mood.impatience)
    for (const s of stuck) {
      const sq = s.square as Square
      const file = sq[0]
      const rank = Number(sq[1])
      const dir = s.color === 'w' ? 1 : -1
      const pawnRank = rank + dir
      if (pawnRank < 1 || pawnRank > 8) continue
      const pawnSq = (file + pawnRank) as Square
      const p = this.chess.get(pawnSq)
      if (!p || p.color !== s.color || p.type !== 'p') continue // its OWN pawn directly ahead
      if (this.rng() >= this.settings.chaos) continue

      // How far the pawn could be shoved: the run of empty squares above it.
      let runway = 0
      for (let r = pawnRank + dir; r >= 1 && r <= 8 && !this.chess.get((file + r) as Square); r += dir) runway += 1

      const pawnId = this.society.bySquare[pawnSq]
      // Trample when there's nowhere to shove the pawn, or (rarely) out of sheer
      // impatience; otherwise the pawn slides up and the piece charges in behind.
      const trample = runway === 0 || this.rng() < 0.35
      let dest: Square
      if (trample) {
        const k = 1 + Math.floor(this.rng() * (runway + 1)) // charge 1..runway+1 ranks
        dest = (file + (rank + k * dir)) as Square
        this.deathFx = 'spiral' // the ONE death that spirals out — trampled underfoot
        if (!knockOff(this.chess, pawnSq)) continue // crush the pawn (clears the path)
        if (pawnId) {
          const pawn = this.society.souls[pawnId]
          if (pawn) {
            pawn.captured = true
            pawn.square = null
          }
          delete this.society.bySquare[pawnSq]
          this.graveyard.push(pawnId)
        }
        this.setSmack(pawnSq, 'SQUISH!') // trampled underfoot
      } else {
        const k = 1 + Math.floor(this.rng() * runway) // charge 1..runway ranks
        dest = (file + (rank + k * dir)) as Square
        const pawnDest = (file + (pawnRank + k * dir)) as Square // pawn stays one ahead
        if (!this.relocate(pawnSq, pawnDest, false)) continue
      }
      if (!this.relocate(sq, dest, false)) continue // the charge itself, keeping our turn
      s.mood.impatience = 0
      this.usedStunts.add('breakout')
      this.setFx('breakout', sq, dest)
      this.logMove(`${dest}${trample ? ' (breakout, trampled)' : ' (breakout)'}`, s.color, true)
      return {
        soulId: s.id,
        square: dest,
        color: s.color,
        name: s.persona.name,
        text: trample ? 'MOVE or be trampled — I waited long enough!' : 'Out of my way — coming through!',
        tone: 'angry',
      }
    }
    return null
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
      const home = sq
      if (!this.relocate(sq, behind, false)) continue
      this.usedStunts.add('coldfeet')
      this.setFx('coldfeet', sq, behind)
      this.logMove(`${behind} (cold feet)`, s.color, true)
      // The player can coax their own spooked piece back to its post for a while.
      if (s.color === PLAYER) this.spooked = { soulId: s.id, home, until: this.society.ply + 6 }
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

  /** A max-rage piece knocks an adjacent enemy clean off the board. The rage
   * must have been *visible for at least a round first* (red aura pulsing) — an
   * eruption in the same beat as the capture that caused it reads as a glitch,
   * not a story (the Gertrude-dies-instantly playtest). */
  private tantrum(): Utterance | null {
    if (this.usedStunts.has('tantrum')) return null
    const furious = Object.values(this.society.souls)
      .filter((s) => !s.captured && s.square && (s.mood.anger >= 0.8 || s.vengefulUntil >= this.society.ply))
      .sort((a, b) => b.mood.anger - a.mood.anger)
    for (const s of furious) {
      const sq = s.square as Square
      const foes = adjacentSquares(sq).filter((a) => {
        const p = this.chess.get(a)
        return p && p.color !== s.color && p.type !== 'k'
      })
      if (!foes.length) continue
      // First sighting of this piece at max rage: let the red state be read for
      // a full round before anything erupts.
      const seen = this.enrageSeen[s.id]
      if (seen === undefined) {
        this.enrageSeen[s.id] = this.society.ply
        continue
      }
      if (this.society.ply <= seen) continue
      if (this.rng() >= this.settings.chaos) continue
      const target = this.pick(foes)
      const victimId = this.society.bySquare[target]
      this.deathFx = 'drag'
      if (!knockOff(this.chess, target)) continue
      if (victimId) {
        const v = this.society.souls[victimId]
        if (v) {
          v.captured = true
          v.square = null
        }
        delete this.society.bySquare[target]
        this.graveyard.push(victimId)
      }
      this.setSmack(target)
      this.usedStunts.add('tantrum')
      this.lastFrom = null
      this.lastTo = target
      this.lastMoverId = s.id
      this.lastMoveRisky = false
      this.setFx('tantrum', sq, target)
      this.logMove(`×${target} (tantrum)`, s.color, true)
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
      this.setFx('defect', null, sq)
      this.lastFrom = null
      this.lastTo = sq
      this.lastMoverId = s.id
      this.lastMoveRisky = false
      this.logMove(`${sq} defects`, 'b', true)
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
   * move) — so chaos is visible even to a passive player. It only happens for a
   * *reason* the player can read: never in the opening, and only when the stunt
   * captures material. Staged in two beats — `aiChaosPlan()` returns the
   * telegraph (a line + the piece to watch), then `aiChaosCommit()` lands it. */
  aiChaosPlan(): AiChaosPlan | null {
    if (this.settings.chaos <= 0 || this.usedStunts.has('aichaos')) return null
    if (this.society.ply < 8) return null // the opening is played straight
    if (this.rng() >= this.settings.chaos * 0.6) return null
    const fen = this.chess.fen()
    let best: { plan: Omit<AiChaosPlan, 'announce'>; gain: number } | null = null
    for (const s of Object.values(this.society.souls)) {
      if (s.captured || s.color !== 'b' || !s.square) continue
      let targets: Square[] = []
      let type: 'jetpack' | 'disguise' | null = null
      if (s.type === 'n') {
        targets = jetpackTargets(this.chess, s.square)
        type = 'jetpack'
      } else if (s.type === 'r') {
        targets = bishopTargets(this.chess, s.square)
        type = 'disguise'
      }
      if (!type) continue
      // Only a stunt that takes something is worth breaking the rules for.
      for (const to of targets) {
        const victim = this.chess.get(to)
        if (!victim) continue
        if (!applyChaosMove(new Chess(fen), s.square, to)) continue
        const gain = PIECE_VALUE[victim.type]
        if (!best || gain > best.gain) best = { plan: { type, soulId: s.id, from: s.square, to }, gain }
      }
    }
    if (!best) return null
    const s = this.society.souls[best.plan.soulId]
    return {
      ...best.plan,
      announce: {
        soulId: s.id,
        square: best.plan.from,
        color: 'b',
        name: s.persona.name,
        text: enemyStuntAnnounce(best.plan.type, this.rng),
        tone: 'gloat',
      },
    }
  }

  /** Land a previously announced enemy stunt (the second beat). */
  aiChaosCommit(plan: AiChaosPlan): Utterance[] {
    const s = this.society.souls[plan.soulId]
    if (!s || s.captured || s.square !== plan.from) return [] // the world changed under the plan
    this.deathFx = 'drag'
    if (!this.relocate(plan.from, plan.to, true)) return []
    this.usedStunts.add('aichaos')
    this.setFx(plan.type, plan.from, plan.to)
    this.logMove(`${plan.type === 'disguise' ? 'R' : 'N'}→${plan.to} (enemy)`, 'b', true)
    const utter: Utterance[] = [
      { soulId: s.id, square: plan.to, color: 'b', name: s.persona.name, text: enemyStuntCommit(plan.type, this.rng), tone: 'gloat' },
    ]
    utter.push(
      ...speak(this.society, scanBoard(this.society, this.chess), this.dialogue, this.rng, this.settings.chatter, 1),
    )
    return utter
  }

  /** One-beat form (announce + commit together) — used by headless tests. */
  aiChaos(): Utterance[] | null {
    const plan = this.aiChaosPlan()
    if (!plan) return null
    const lines = this.aiChaosCommit(plan)
    return lines.length ? [plan.announce, ...lines] : null
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
      this.graveyard.push(victimId)
      this.setSmack(to) // an off-book capture still gets its comic burst
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
   * Occasionally a piece pipes up and pre-selects itself with advice — GOOD (a
   * real opportunity) or, when the team doesn't trust your generalship, confident
   * BAD advice (a blundering move). Rare (cooldown + chance).
   */
  suggest(): Utterance | null {
    if (!this.canPlay || this.selected) return null
    if (this.settings.agency <= 0) return null
    if (this.society.ply - this.lastSuggestPly < 8) return null
    if (this.rng() > this.settings.agency * 0.45) return null

    const fen = this.chess.fen()
    const badChance = ((100 - this.trust) / 100) * 0.7 // a wary army shouts bad ideas
    const wantBad = this.rng() < badChance
    let from: Square | null = null
    let bad = false
    if (wantBad) {
      const b = worstBlunder(fen, PLAYER)
      if (b) {
        from = b.from
        bad = true
      }
    }
    if (!from) {
      const o = bestOpportunity(fen, PLAYER)
      if (o) from = o.from
    }
    if (!from) {
      // fall back to whatever advice exists
      const b = worstBlunder(fen, PLAYER)
      if (b) {
        from = b.from
        bad = true
      }
    }
    if (!from) return null

    const soul = this.soulAt(from)
    if (!soul) return null
    this.selected = from
    this.lastSuggestPly = this.society.ply
    const reckless = (soul.persona.recklessness ?? 0.3) > 0.6
    return {
      soulId: soul.id,
      square: from,
      color: soul.color,
      name: soul.persona.name,
      text: bad ? badAdviceLine(this.rng) : suggestLine(reckless, this.rng),
      tone: 'gloat',
    }
  }

  /**
   * Pregame conversations between adjacent pieces — this is where friendships
   * actually form (each exchange bonds the pair), so later grief is grounded in
   * something you saw. Each pair gets a real back-and-forth (opener → reply →
   * banter → closer, speakers alternating), lines never repeating within the
   * pregame, and the longer exchange forms a stronger bond.
   */
  pregameChatter(): Utterance[] {
    const souls = Object.values(this.society.souls).filter((s) => !s.captured && s.square)
    const pairs: [PieceSoul, PieceSoul][] = []
    for (const a of souls) {
      for (const nsq of adjacentSquares(a.square as Square)) {
        const bId = this.society.bySquare[nsq]
        if (!bId) continue
        const b = this.society.souls[bId]
        if (b.color === a.color && a.id < b.id) pairs.push([a, b]) // dedupe
      }
    }
    pairs.sort(() => this.rng() - 0.5)
    const seated = new Set<string>()
    const usedLines = new Set<string>() // no repeated templates across the whole pregame
    const out: Utterance[] = []
    const say = (s: PieceSoul, text: string): Utterance => ({
      soulId: s.id,
      square: s.square,
      color: s.color,
      name: s.persona.name,
      text,
      tone: 'calm',
    })
    let taken = 0
    for (const [a, b] of pairs) {
      if (taken >= 3) break // a few real conversations beat many drive-bys
      if (seated.has(a.id) || seated.has(b.id)) continue
      seated.add(a.id)
      seated.add(b.id)
      // A conversation, alternating: a opens, b replies, then banter, b closes.
      out.push(say(a, chatOpener(b.persona.name, this.rng, usedLines)))
      out.push(say(b, chatReply(a.persona.name, this.rng, usedLines)))
      out.push(say(a, chatBanter(b.persona.name, this.rng, usedLines)))
      out.push(say(b, chatCloser(a.persona.name, this.rng, usedLines)))
      // The exchange forms the friendship — a long one bonds them tightly.
      a.bonds[b.id] = Math.min(1, (a.bonds[b.id] ?? 0) + 0.7)
      b.bonds[a.id] = Math.min(1, (b.bonds[a.id] ?? 0) + 0.7)
      taken += 1
    }
    return out
  }

  /** Off-duty chit-chat from a random living friendly piece (pre-game). */
  smallTalk(): Utterance[] {
    const mine = Object.values(this.society.souls).filter((s) => !s.captured && s.color === PLAYER && s.square)
    if (!mine.length) return []
    const s = this.pick(mine)
    return [{ soulId: s.id, square: s.square, color: PLAYER, name: s.persona.name, text: smallTalkLine(this.rng), tone: 'calm' }]
  }

  /** A parting line once the game is over (win/loss aware). */
  postGame(): Utterance[] {
    const won = this.chess.isCheckmate() && this.turn !== PLAYER
    const mine = Object.values(this.society.souls).filter((s) => !s.captured && s.color === PLAYER && s.square)
    if (!mine.length) return []
    const s = this.pick(mine)
    return [
      { soulId: s.id, square: s.square, color: PLAYER, name: s.persona.name, text: postGameLine(won, this.rng), tone: won ? 'gloat' : 'sad' },
    ]
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

  /** The fallen, in the order they were taken — for the graveyard ("the box"). */
  fallen(): { id: string; name: string; type: PieceType; color: Color }[] {
    return this.graveyard
      .map((id) => this.society.souls[id])
      .filter(Boolean)
      .map((s) => ({ id: s.id, name: s.persona.name, type: s.type, color: s.color }))
  }

  /** Names of the player's surviving pieces (for the share message). */
  livingCast(): string[] {
    return Object.values(this.society.souls)
      .filter((s) => !s.captured && s.color === PLAYER)
      .map((s) => s.persona.name)
  }
}
