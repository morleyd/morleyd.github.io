<script setup lang="ts">
/**
 * Wizard Chess — renders the headless WizardGame: a squares layer (colours,
 * highlights, move dots, clicks) and a separate, absolutely-positioned pieces
 * layer that animates. Movement uses TransitionGroup FLIP; a piece's travel
 * speed comes from its temperament and the move's risk. Mood animations are
 * capped and situational (chosen by the controller), banter is paced and
 * delayed, and idle-heckles nudge a dawdling player.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import { Engine } from '@/services/chess/engine'
import { WizardGame, type StuntFx } from '@/services/chess/game'
import { TYPE_NAME } from '@/services/chess/profiles'
import { loadSettings, loadTrust, saveSettings, saveTrust } from '@/services/chess/settings'
import type { Color, PieceType, Square, Utterance } from '@/services/chess/types'

const route = useRoute()
const router = useRouter()

// Real piece art: the classic Wikipedia (Cburnett) set — replaces the old
// unicode glyphs (and their iOS emoji-rendering workaround). Transparent PNGs,
// so drop-shadow auras and transform animations apply cleanly, and accessories
// (flame, glasses) can be overlaid for stunt storytelling.
import wP from '@/assets/chess/wP.png'
import wN from '@/assets/chess/wN.png'
import wB from '@/assets/chess/wB.png'
import wR from '@/assets/chess/wR.png'
import wQ from '@/assets/chess/wQ.png'
import wK from '@/assets/chess/wK.png'
import bP from '@/assets/chess/bP.png'
import bN from '@/assets/chess/bN.png'
import bB from '@/assets/chess/bB.png'
import bR from '@/assets/chess/bR.png'
import bQ from '@/assets/chess/bQ.png'
import bK from '@/assets/chess/bK.png'
const PIECE_IMG: Record<Color, Record<PieceType, string>> = {
  w: { p: wP, n: wN, b: wB, r: wR, q: wQ, k: wK },
  b: { p: bP, n: bN, b: bB, r: bR, q: bQ, k: bK },
}
const imgOf = (color: Color, type: PieceType): string => PIECE_IMG[color][type]
const LEVEL_NAMES = ['', 'Novice', 'Casual', 'Steady', 'Sharp', 'Cunning', 'Ruthless']

const engine = new Engine()
const initialSeed = randomSeed()
const game = new WizardGame(initialSeed)

// Player-tunable scalers, shared live with the controller and persisted.
const settings = ref(loadSettings())
game.settings = settings.value
watch(settings, (s) => saveSettings(s), { deep: true })

// The team's trust persists across games; the controller mutates game.trust as
// you play, so save it whenever the board version bumps.
game.trust = loadTrust()

const code = ref(initialSeed)
const level = ref(3)
const version = ref(0)
const snackbar = ref(false)
const bump = () => (version.value += 1)

// ── Paced banter ────────────────────────────────────────────────────────────
// Bubbles are pinned to the speaking PIECE (rendered as a child of its box, like
// the jetpack flame) so they track it as it moves and never divorce from it. At
// most one bubble per side is visible at a time — one ally + one enemy — so the
// board never disappears under chatter.
interface Bubble {
  soulId: string
  color: Color
  name: string
  text: string
  tone: Utterance['tone']
  bid: number
}
type LogLine = Utterance & { ts: number }
const bubbles = ref<Record<string, Bubble>>({}) // keyed by soulId
const log = ref<LogLine[]>([])
let queue: Utterance[] = []
let pumpTimer: ReturnType<typeof setTimeout> | null = null
let bubbleId = 0
let pregameQueued = false
const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>() // keyed by soulId

let pumpInterval = 1000 // gap between revealed lines; wider for unhurried pregame banter
function enqueue(lines: Utterance[], delay = 0, interval = 1000) {
  if (!lines.length) return
  queue.push(...lines)
  if (queue.length > 12) queue.splice(0, queue.length - 12)
  pump(delay, interval)
}
function pump(delay: number, interval = 1000) {
  if (pumpTimer) return
  pumpInterval = interval
  const step = () => {
    const u = queue.shift()
    if (!u) {
      pumpTimer = null
      pumpInterval = 1000
      return
    }
    reveal(u)
    pumpTimer = setTimeout(step, pumpInterval)
  }
  pumpTimer = setTimeout(step, delay)
}
/** The moment the player commits their first move, cut the pregame smalltalk —
 * it must not spill into the game and clutter a mobile screen. */
function stopPregame() {
  if (!pregameQueued) return
  pregameQueued = false
  queue = []
  if (pumpTimer) {
    clearTimeout(pumpTimer)
    pumpTimer = null
  }
}
const lastSaidBy = new Map<string, number>() // soulId -> last reveal time (ms)
let recentTexts: string[] = []
function reveal(u: Utterance) {
  const t = game.now()
  // One line per piece at a time, and never repeat a recent line.
  if (t - (lastSaidBy.get(u.soulId) ?? -1e9) < 2600) return
  if (recentTexts.includes(u.text)) return
  const soul = game.society.souls[u.soulId]
  if (u.square && soul && !soul.captured) {
    lastSaidBy.set(u.soulId, t)
    recentTexts.push(u.text)
    if (recentTexts.length > 40) recentTexts.shift()
    showBubble(u)
  }
  log.value.unshift({ ...u, ts: t })
  if (log.value.length > 40) log.value.length = 40
}
function showBubble(u: Utterance) {
  // One per colour: a new speaker silences the previous one on its own side.
  for (const [id, b] of Object.entries(bubbles.value)) {
    if (id === u.soulId || b.color === u.color) clearBubble(id)
  }
  bubbles.value = {
    ...bubbles.value,
    [u.soulId]: { soulId: u.soulId, color: u.color, name: u.name, text: u.text, tone: u.tone, bid: bubbleId++ },
  }
  bubbleTimers.set(
    u.soulId,
    setTimeout(() => clearBubble(u.soulId), 5000),
  )
}
function clearBubble(soulId: string) {
  const t = bubbleTimers.get(soulId)
  if (t) clearTimeout(t)
  bubbleTimers.delete(soulId)
  if (bubbles.value[soulId]) {
    const next = { ...bubbles.value }
    delete next[soulId]
    bubbles.value = next
  }
}
const bubbleFor = (soulId: string): Bubble | null => bubbles.value[soulId] ?? null
function clearBanter() {
  queue = []
  pregameQueued = false
  if (pumpTimer) {
    clearTimeout(pumpTimer)
    pumpTimer = null
  }
  bubbleTimers.forEach((t) => clearTimeout(t))
  bubbleTimers.clear()
  bubbles.value = {}
  log.value = []
  lastSaidBy.clear()
  recentTexts = []
}

// ── One-shot resistance cues (shake / hop) ────────────────────────────────
const cueMap = ref<Record<string, string>>({})
const cueTimers = new Map<string, ReturnType<typeof setTimeout>>()
function triggerCue(soulId: string, type: string) {
  cueMap.value = { ...cueMap.value, [soulId]: type }
  const prev = cueTimers.get(soulId)
  if (prev) clearTimeout(prev)
  cueTimers.set(
    soulId,
    setTimeout(() => {
      const next = { ...cueMap.value }
      delete next[soulId]
      cueMap.value = next
      cueTimers.delete(soulId)
    }, 480),
  )
}
const cueClass = (id: string) => (cueMap.value[id] ? 'cue-' + cueMap.value[id] : '')

// ── Lingering stunt FX ─────────────────────────────────────────────────────
// Any rule-breaking moment leaves a visible mark on the board (origin ghost +
// destination ring + a label naming the stunt) that lingers long enough to be
// read — so "wait, what just happened?" always has an answer on the board.
const stuntFx = ref<(Omit<StuntFx, 'seq'> & { seq?: number }) | null>(null)
let fxTimer: ReturnType<typeof setTimeout> | null = null
let lastFxSeq = -1
const FX_LABEL: Record<string, string> = {
  jetpack: 'JETPACK!',
  disguise: 'DISGUISE!',
  rage: 'RAGE-STRIKE!',
  breakout: 'BREAKOUT!',
  coldfeet: 'COLD FEET',
  defect: 'DEFECTED!',
  entourage: 'MOVE AS ONE!',
  swap: 'SWITCHEROO!',
  telegraph: 'UP TO SOMETHING…',
}
function stuntMark(f: { kind: StuntFx['kind']; from: Square | null; to: Square }) {
  stuntFx.value = f
  if (fxTimer) clearTimeout(fxTimer)
  fxTimer = setTimeout(() => (stuntFx.value = null), 5500)
}
watch(version, () => {
  // Pick up marks the game logic set (player stunts, spontaneous chaos, enemy commits).
  if (game.fx && game.fx.seq !== lastFxSeq) {
    lastFxSeq = game.fx.seq
    stuntMark(game.fx)
  }
})
const fxRingStyle = (sq: Square) => {
  const { col, row } = rc(sq)
  return { left: `${(col / 8) * 100}%`, top: `${(row / 8) * 100}%` }
}
const fxLabelStyle = (sq: Square) => {
  const { col, row } = rc(sq)
  const tx = col <= 1 ? '0%' : col >= 6 ? '-100%' : '-50%'
  return { left: `${((col + 0.5) / 8) * 100}%`, top: `${(row / 8) * 100}%`, '--tx': tx }
}

// ── Comic-book violence ────────────────────────────────────────────────────
// Captures burst a POW!/WHAM! starburst at the square — the comic panel does
// the smashing our pieces can't act out.
const smack = ref<{ square: Square; word: string } | null>(null)
let smackTimer: ReturnType<typeof setTimeout> | null = null
let lastSmackSeq = -1
watch(version, () => {
  if (game.smack && game.smack.seq !== lastSmackSeq) {
    lastSmackSeq = game.smack.seq
    smack.value = { square: game.smack.square, word: game.smack.word }
    if (smackTimer) clearTimeout(smackTimer)
    smackTimer = setTimeout(() => (smack.value = null), 1300)
  }
})
const smackStyle = (sq: Square) => {
  const { col, row } = rc(sq)
  return { left: `${((col + 0.5) / 8) * 100}%`, top: `${((row + 0.5) / 8) * 100}%` }
}

// ── The edge graveyard ──────────────────────────────────────────────────────
// No more "box" and no more length-of-the-board drag: a captured piece takes a
// short haul to the nearest free slot just OFF the board edge, and rests there.
// The frame reserves a gutter (GUT%) all round for these slots.
const GUT = 8 // % of the board-frame kept as an off-board gutter on each side
const BSPAN = 100 - 2 * GUT // the playable board spans this % of the frame
// Board square center, in frame % (the pieces layer lives inside the inset board;
// the graveyard layer spans the whole frame, so it needs this mapping).
const framePos = (sq: Square) => {
  const { col, row } = rc(sq)
  return { x: GUT + ((col + 0.5) / 8) * BSPAN, y: GUT + ((row + 0.5) / 8) * BSPAN }
}
// 32 perimeter slots (8 per edge), enough for all 30 possible casualties.
const SLOTS: { x: number; y: number }[] = (() => {
  const s: { x: number; y: number }[] = []
  const along = (i: number) => GUT + ((i + 0.5) / 8) * BSPAN
  for (let i = 0; i < 8; i += 1) s.push({ x: along(i), y: GUT / 2 }) // top
  for (let i = 0; i < 8; i += 1) s.push({ x: 100 - GUT / 2, y: along(i) }) // right
  for (let i = 0; i < 8; i += 1) s.push({ x: along(i), y: 100 - GUT / 2 }) // bottom
  for (let i = 0; i < 8; i += 1) s.push({ x: GUT / 2, y: along(i) }) // left
  return s
})()
// Deterministically assign each fallen piece the nearest still-free slot to
// where it died — so the layout is stable across undo/redo (re-derived, no
// stored slot state).
const graveLayout = computed(() => {
  version.value
  const used = new Set<number>()
  const out: { id: string; type: PieceType; color: Color; x: number; y: number; name: string }[] = []
  for (const f of game.fallen()) {
    if (!f.diedAt) continue
    const d = framePos(f.diedAt)
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < SLOTS.length; i += 1) {
      if (used.has(i)) continue
      const dx = SLOTS[i].x - d.x
      const dy = SLOTS[i].y - d.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    if (best < 0) continue
    used.add(best)
    out.push({ id: f.id, type: f.type, color: f.color, name: f.name, x: SLOTS[best].x, y: SLOTS[best].y })
  }
  return out
})
const graveSlotOf = (id: string) => graveLayout.value.find((g) => g.id === id) ?? null
// A piece still being hauled off is drawn by its transit element, not yet as a
// resting grave — so exclude it here to avoid a double image (its slot stays
// reserved by graveLayout above).
const restingGraves = computed(() => {
  const moving = new Set(transits.value.map((t) => t.id))
  return graveLayout.value.filter((g) => !moving.has(g.id))
})
// A piece currently animating from its death square out to its slot. It holds on
// the square for a beat (so the capture reads), then hauls to the edge.
interface Transit {
  id: string
  tuggerId: string | null // the piece doing the dragging (stays on the board, heaving)
  type: PieceType
  color: Color
  fromX: number
  fromY: number
  toX: number
  toY: number
  phase: 'hold' | 'drag'
}
const transits = ref<Transit[]>([])
const transitTimers = new Map<string, ReturnType<typeof setTimeout>[]>()
let seenFallen = new Set<string>()
const HOLD_MS = 1000 // the full second between the capturer landing and the haul
const DRAG_MS = 650
function cancelTransit(id: string) {
  ;(transitTimers.get(id) ?? []).forEach(clearTimeout)
  transitTimers.delete(id)
  transits.value = transits.value.filter((t) => t.id !== id)
}
function beginTransit(id: string) {
  const f = game.fallen().find((x) => x.id === id)
  const slot = graveSlotOf(id)
  if (!f || !f.diedAt || !slot) return
  const from = framePos(f.diedAt)
  // Whoever just moved onto the victim's square is the one hauling it off.
  const tuggerId = game.lastMoverId && game.society.souls[game.lastMoverId]?.square === f.diedAt ? game.lastMoverId : null
  const t: Transit = { id, tuggerId, type: f.type, color: f.color, fromX: from.x, fromY: from.y, toX: slot.x, toY: slot.y, phase: 'hold' }
  transits.value = [...transits.value, t]
  const timers = [
    setTimeout(() => {
      const cur = transits.value.find((x) => x.id === id)
      if (cur) cur.phase = 'drag'
      transits.value = [...transits.value] // nudge reactivity
    }, HOLD_MS),
    setTimeout(() => cancelTransit(id), HOLD_MS + DRAG_MS + 60),
  ]
  transitTimers.set(id, timers)
}
// New casualties → start a transit each; undone captures → cancel any transit.
watch(version, () => {
  const now = new Set(game.graveyard)
  for (const id of game.graveyard) if (!seenFallen.has(id)) beginTransit(id)
  for (const id of [...seenFallen]) if (!now.has(id)) cancelTransit(id)
  seenFallen = now
})
function clearGraveyardFx() {
  transitTimers.forEach((ts) => ts.forEach(clearTimeout))
  transitTimers.clear()
  transits.value = []
  seenFallen = new Set(game.graveyard)
}
const graveStyle = (g: { x: number; y: number }) => ({ left: `${g.x}%`, top: `${g.y}%` })
const transitStyle = (t: Transit) => {
  const dragging = t.phase === 'drag'
  // The rope points BACK to the captor (still on the victim's old square), so it
  // reads as a taut line the dragging piece is hauling on.
  const angle = (Math.atan2(t.fromY - t.toY, t.fromX - t.toX) * 180) / Math.PI
  return {
    left: `${dragging ? t.toX : t.fromX}%`,
    top: `${dragging ? t.toY : t.fromY}%`,
    '--drag-ms': `${DRAG_MS}ms`,
    '--rope-angle': `${angle}deg`,
  }
}
// The captors currently heaving on a rope (their victim is mid-haul).
const tuggingIds = computed(() => new Set(transits.value.filter((t) => t.phase === 'drag' && t.tuggerId).map((t) => t.tuggerId as string)))

// ── Endgame banner ─────────────────────────────────────────────────────────
// The game being over must be unmissable: a big banner across the board,
// green for a win, red for a loss, slate for a draw.
const endBanner = computed<{ title: string; sub: string; cls: string } | null>(() => {
  version.value
  if (!game.gameOver) return null
  if (game.chess.isCheckmate()) {
    return game.turn !== 'w'
      ? { title: 'CHECKMATE!', sub: 'You win — the enemy king has fallen', cls: 'win' }
      : { title: 'CHECKMATE', sub: 'Your king has fallen', cls: 'lose' }
  }
  if (game.chess.isStalemate()) return { title: 'STALEMATE', sub: 'Nobody can move — a stiff, awkward draw', cls: 'draw' }
  return { title: 'DRAW', sub: 'Everyone lives to bicker another day', cls: 'draw' }
})

// ── Stunt accessories ──────────────────────────────────────────────────────
// The evidence goes ON the piece — both while an offer is on the table (so you
// can SEE what you'd be opting into: glasses = "I could be a bishop") and while
// the stunt's FX lingers afterwards.
type Accessory = 'flame' | 'glasses' | 'hat' | 'banner' | null
function accessoryOf(p: PieceView): Accessory {
  // An active offer dresses the selected piece for the part.
  if (p.square === selectedSquare.value) {
    const t = game.chaosOfferType()
    if (t === 'jetpack') return 'flame'
    if (t === 'disguise') return 'glasses'
    if (t === 'entourage') return 'banner'
  }
  const f = stuntFx.value
  if (!f) return null
  if (f.kind === 'jetpack' && p.square === f.to) return 'flame'
  if (f.kind === 'disguise' && p.square === f.to) return 'glasses'
  if (f.kind === 'defect' && p.square === f.to) return 'hat'
  if (f.kind === 'entourage' && p.square === f.to) return 'banner'
  return null
}

// ── Idle heckling ─────────────────────────────────────────────────────────
// Fires at most ONCE per idle stretch: a real interaction re-arms it. (Previously
// it re-armed itself every 16s, producing a wall of repeated heckles.)
let idleTimer: ReturnType<typeof setTimeout> | null = null
function armIdle(delay = 22_000) {
  if (idleTimer) clearTimeout(idleTimer)
  if (!game.canPlay) return
  idleTimer = setTimeout(() => {
    idleTimer = null
    const u = game.idleHeckle()
    if (u) enqueue([u])
  }, delay)
}

// ── Reactive, derived board ─────────────────────────────────────────────────
interface PieceView {
  id: string
  type: PieceType
  color: Color
  colorClass: 'white' | 'black'
  square: Square
}
const piecesList = computed<PieceView[]>(() => {
  version.value
  return Object.values(game.society.souls)
    .filter((s) => !s.captured && s.square)
    .map((s) => ({
      id: s.id,
      type: s.type,
      color: s.color,
      colorClass: s.color === 'w' ? 'white' : 'black',
      square: s.square as Square,
    }))
})
const animMap = computed(() => (version.value, game.animations()))
const selectedSquare = computed(() => (version.value, game.selected))
const legalTargets = computed(() => (version.value, game.legalTargets()))
const chaosTargets = computed(() => (version.value, new Set(game.chaosTargets())))
const rageOffer = computed(() => (version.value, game.chaosOfferType() === 'rage'))
const canPlay = computed(() => (version.value, game.canPlay))
const thinking = computed(() => (version.value, game.aiThinking))
const checkSquare = computed<Square | null>(() => {
  version.value
  if (!game.chess.isCheck()) return null
  const turn = game.chess.turn()
  for (const c of game.chess.board().flat()) if (c && c.type === 'k' && c.color === turn) return c.square
  return null
})
const selectedName = computed(() => {
  const sq = selectedSquare.value
  if (!sq) return null
  const s = game.soulAt(sq)
  return s ? `${s.persona.name} the ${TYPE_NAME[s.type]}` : null
})
const status = computed(() => {
  version.value
  if (game.chess.isCheckmate()) return game.turn === 'w' ? 'Checkmate — your king has fallen.' : 'Checkmate! You win.'
  if (game.chess.isStalemate()) return 'Stalemate — a stiff, awkward draw.'
  if (game.chess.isDraw()) return "It's a draw. Everyone lives to bicker another day."
  if (game.turn !== 'w' || game.aiThinking) return 'The enemy is plotting…'
  if (selectedName.value) {
    // Holding a runaway: teach the coax (the recourse for misbehaving pieces).
    if (game.coaxTarget()) {
      const s = game.soulAt(selectedSquare.value as Square)
      return `${s?.persona.name ?? 'It'} went off on its own — tap the green ring to order it back to its post (free).`
    }
    // A vengeful piece's red pulse gets explained the moment you pick it up —
    // and, when a rage-strike is on offer, told how to spend it.
    const s = game.soulAt(selectedSquare.value as Square)
    if (s && s.vengefulUntil >= game.society.ply) {
      const killer = s.avenging ? game.society.souls[s.avenging]?.persona.name : null
      const strike = game.chaosOfferType() === 'rage' && game.chaosTargets().length > 0
      return `${s.persona.name} burns with vengeance${killer ? ` against ${killer}` : ''}${strike ? ' — tap a red ring to strike' : ''}.`
    }
    return `Holding ${selectedName.value} — pick a square.`
  }
  // An enemy piece just cheated: point the player at the reprimand.
  const cheatSq = game.reprimandSquare()
  if (cheatSq && reprimandSquare.value) {
    const c = game.soulAt(cheatSq)
    return `${c?.persona.name ?? 'That piece'} cheated! Tap the gold ring to march it back to the rules.`
  }
  // A runaway on the loose: point the player at the fix before anything else.
  const runaway = game.waywardSoul()
  if (runaway) return `${runaway.persona.name} moved on its own — select it to order it back.`
  if (game.chess.isCheck()) return 'You are in check!'
  return 'Your move.'
})

const FILES = 'abcdefgh'
const squareOf = (i: number): Square => FILES[i % 8] + (8 - Math.floor(i / 8))
const rc = (sq: Square) => ({ col: sq.charCodeAt(0) - 97, row: 8 - Number(sq[1]) })

const animClass = (square: Square) => {
  const a = animMap.value[square]
  return a ? 'anim-' + a : ''
}
// Travel speed: bold/reckless pieces dash, timid ones creep; risky moves drag.
// Deliberately unhurried across the board — the movement is part of the story.
function moveMs(p: PieceView): number {
  const s = game.society.souls[p.id]
  const bold = Math.max(s.persona.bravery ?? 0.5, s.persona.recklessness ?? 0.3)
  let ms = Math.round(720 - bold * 400) // ~320–720ms
  if (p.id === game.lastMoverId && game.lastMoveRisky) ms = Math.round(ms * 1.8)
  return ms
}
const pieceStyle = (p: PieceView) => {
  const { col, row } = rc(p.square)
  return { left: `${(col / 8) * 100}%`, top: `${(row / 8) * 100}%`, '--move-ms': `${moveMs(p)}ms` }
}

// Table talk: resolve the speaker so each line can show its piece image + type.
const IMG_FOR = (u: Utterance): string => {
  const s = game.society.souls[u.soulId]
  return s ? imgOf(u.color, s.type) : imgOf('w', 'p')
}
const TYPE_FOR = (u: Utterance): string => {
  const s = game.society.souls[u.soulId]
  return s ? TYPE_NAME[s.type] : ''
}

// Timestamps: mm:ss since the game began — shared by moves and chat so events
// can be paired in time.
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

// Move tracker: chronological + timestamped (chaos/spontaneous plies flagged),
// which also sidesteps the old white/black column mis-pairing.
const moveRows = computed(() => {
  version.value
  return game.moveLog.map((m) => ({ ...m, time: fmt(m.ts) }))
})

// Per-piece special states → a small icon badge on the piece.
const pieceStates = computed(() => (version.value, game.states()))
const stateClass = (sq: Square) => {
  const s = pieceStates.value[sq]
  return s ? 'state-' + s : ''
}
const coaxSquare = computed(() => (version.value, game.coaxTarget()))
// The glowing home square a cheated enemy piece can be marched back to.
const reprimandSquare = computed(() => (version.value, game.reprimandTarget()))
// Legal targets that land on an enemy — rendered as a capture RING, not a dot.
const captureTargets = computed(() => {
  version.value
  const out = new Set<Square>()
  if (!game.selected) return out
  for (const t of game.legalTargets()) if (game.chess.get(t)) out.add(t)
  return out
})

// Team trust (persists across games): its opinion of your generalship.
const trustPct = computed(() => (version.value, Math.round(game.trust)))
const trustLabel = computed(() => {
  const t = trustPct.value
  if (t < 20) return 'Mutinous'
  if (t < 40) return 'Wary'
  if (t < 60) return 'Uneasy'
  if (t < 80) return 'Loyal'
  return 'Devoted'
})
// What the current trust tier actually DOES — the arc is a mechanic, not just
// a meter: high trust silences back-talk, low trust breeds refusals + bad tips.
const trustHint = computed(() => {
  const t = trustPct.value
  if (t < 20) return 'They refuse orders and shout bad advice.'
  if (t < 40) return 'Expect arguments and dubious tips.'
  if (t < 60) return "They'll question risky orders."
  if (t < 85) return 'Mostly obedient — the odd grumble.'
  return 'They follow your orders without question.'
})
const trustColor = computed(() => {
  const t = trustPct.value
  return t < 30 ? '#ef4444' : t < 55 ? '#f59e0b' : t < 75 ? '#eab308' : '#22c55e'
})
watch(version, () => saveTrust(game.trust)) // persist as the team's opinion shifts
const checkStyle = computed(() => {
  if (!checkSquare.value) return {}
  const { col, row } = rc(checkSquare.value)
  return { left: `${(col / 8) * 100}%`, top: `${(row / 8) * 100}%` }
})

// ── Character sheet (long-press / right-click any piece) ───────────────────
interface SheetData {
  id: string
  name: string
  type: PieceType
  intro: string
  color: Color
  bravery: number
  recklessness: number
  patience: number
  sass: number
  mood: { fear: number; anger: number; impatience: number; joy: number; confidence: number }
}
const sheet = ref<SheetData | null>(null)
const sheetOpen = ref(false)
const TRAITS: { key: 'bravery' | 'recklessness' | 'patience' | 'sass'; label: string }[] = [
  { key: 'bravery', label: 'Bravery' },
  { key: 'recklessness', label: 'Recklessness' },
  { key: 'patience', label: 'Patience' },
  { key: 'sass', label: 'Sass' },
]
const MOODS: { key: keyof SheetData['mood']; label: string; color: string }[] = [
  { key: 'fear', label: 'Fear', color: '#60a5fa' },
  { key: 'anger', label: 'Anger', color: '#ef4444' },
  { key: 'impatience', label: 'Impatience', color: '#f59e0b' },
  { key: 'joy', label: 'Joy', color: '#22c55e' },
  { key: 'confidence', label: 'Confidence', color: '#a855f7' },
]
function openSheetAt(square: Square) {
  const s = game.soulAt(square)
  if (!s) return
  sheet.value = {
    id: s.id,
    name: s.persona.name,
    type: s.type,
    intro: s.persona.intro,
    color: s.color,
    bravery: s.persona.bravery ?? 0.5,
    recklessness: s.persona.recklessness ?? 0.3,
    patience: s.persona.patience ?? 0.5,
    sass: s.sass,
    mood: { ...s.mood },
  }
  sheetOpen.value = true
}
// Push an edited trait back onto the live piece so it changes behaviour.
function setTrait(key: 'bravery' | 'recklessness' | 'patience' | 'sass', v: number) {
  if (!sheet.value) return
  sheet.value[key] = v
  const s = game.society.souls[sheet.value.id]
  if (!s) return
  if (key === 'sass') s.sass = v
  else s.persona[key] = v
  bump()
}

// Long-press detection (works for touch and mouse) without stealing taps.
let pressTimer: ReturnType<typeof setTimeout> | null = null
let suppressClick = false
function startPress(square: Square) {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    pressTimer = null
    if (game.soulAt(square)) {
      suppressClick = true
      openSheetAt(square)
    }
  }, 450)
}
function endPress() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

// ── Turn flow ────────────────────────────────────────────────────────────
function onSquare(square: Square) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (!canPlay.value) return
  const graveBefore = game.graveyard.length
  const res = game.playerTap(square)
  if (res.introSoul) {
    log.value.unshift({
      soulId: res.introSoul.id,
      square,
      color: res.introSoul.color,
      name: res.introSoul.persona.name,
      text: res.introSoul.persona.intro,
      tone: 'calm',
      ts: game.now(),
    })
  }
  if (res.cue) triggerCue(res.cue.soulId, res.cue.type)
  if (res.moved) stopPregame() // first move cuts any lingering pregame smalltalk
  enqueue(res.utterances, res.moved ? 650 : 0)
  bump()
  armIdle()
  if (res.moved) {
    maybePostGame()
    // After a capture, give the victor a beat to haul its victim off and settle
    // on the square before the enemy can march in and drag IT away.
    const captured = game.graveyard.length > graveBefore
    window.setTimeout(runAi, captured ? 2600 : 420)
  }
}

let postSaid = false
function maybePostGame() {
  if (game.gameOver && !postSaid) {
    postSaid = true
    enqueue(game.postGame(), 700)
    bump()
  }
}

async function runAi() {
  if (game.gameOver) return
  game.aiThinking = true
  bump()
  // The enemy sometimes pulls a stunt instead of a normal move — staged in two
  // beats so the player can see it coming: a telegraph line + a mark on the
  // piece, THEN (a beat later) the stunt itself.
  const plan = game.aiChaosPlan()
  if (plan) {
    enqueue([plan.announce], 400)
    stuntMark({ kind: 'telegraph', from: null, to: plan.from })
    bump()
    window.setTimeout(() => {
      const lines = game.aiChaosCommit(plan)
      if (!lines.length) {
        void engineMove() // the plan died on an illegal position — play it straight
        return
      }
      game.aiThinking = false
      enqueue(lines, 200)
      bump()
      maybePostGame()
      armIdle()
      scheduleFollowUp()
    }, 2600)
    return
  }
  await engineMove()
}

async function engineMove() {
  const best = await engine.bestMove(game.chess.fen(), level.value)
  game.aiThinking = false
  if (best && !game.gameOver) enqueue(game.aiApply(best), 650)
  bump()
  maybePostGame()
  armIdle()
  scheduleFollowUp()
}

// At most ONE follow-up beat per enemy turn, arriving as its own scene a couple
// of seconds after the move so big moments never land on top of each other: a
// spontaneous stunt (tantrum / breakout / cold feet / defection), or failing
// that, a piece volunteering advice. Never both.
let followUpTimer: ReturnType<typeof setTimeout> | null = null
function scheduleFollowUp() {
  if (followUpTimer) clearTimeout(followUpTimer)
  followUpTimer = setTimeout(() => {
    followUpTimer = null
    if (game.gameOver) return
    const sp = game.spontaneousChaos()
    if (sp) {
      enqueue([sp])
      bump()
      return
    }
    const s = game.suggest()
    if (s) {
      enqueue([s])
      bump()
    }
  }, 2600)
}

// ── Setup ────────────────────────────────────────────────────────────────
const syncUrl = () => router.replace({ name: 'wizard-chess', params: { seed: `${level.value}.${code.value}` } })
function start(fen?: string) {
  game.reset(code.value, fen)
  clearBanter()
  cueMap.value = {}
  stuntFx.value = null
  if (fxTimer) clearTimeout(fxTimer)
  if (followUpTimer) {
    clearTimeout(followUpTimer)
    followUpTimer = null
  }
  lastFxSeq = -1
  smack.value = null
  if (smackTimer) clearTimeout(smackTimer)
  lastSmackSeq = -1
  clearGraveyardFx()
  postSaid = false
  bump()
  // Adjacent pieces get properly acquainted (multi-turn conversations that form
  // bonds) — an unhurried scene, so the idle heckle waits until it's over.
  pregameQueued = true
  enqueue(game.pregameChatter(), 800, 2600)
  armIdle(50_000)
}
function newGame() {
  code.value = randomSeed()
  syncUrl()
  start()
}
function setLevel(v: number) {
  level.value = v
  syncUrl()
}

// ── Undo / redo ────────────────────────────────────────────────────────────
// Only on your own turn (never mid-thought). Undo peels back your last move and
// the enemy's reply to it; redo puts them back.
const canUndo = computed(() => (version.value, canPlay.value && game.canUndo))
const canRedo = computed(() => (version.value, canPlay.value && game.canRedo))
function afterJump() {
  // Tear down every in-flight animation/timer — the board just teleported.
  clearBanter()
  stuntFx.value = null
  if (fxTimer) clearTimeout(fxTimer)
  lastFxSeq = game.fx ? game.fx.seq : -1
  smack.value = null
  if (smackTimer) clearTimeout(smackTimer)
  lastSmackSeq = game.smack ? game.smack.seq : -1
  if (followUpTimer) {
    clearTimeout(followUpTimer)
    followUpTimer = null
  }
  clearGraveyardFx()
  postSaid = false
  bump()
  armIdle()
}
function doUndo() {
  if (game.undo()) afterJump()
}
function doRedo() {
  if (game.redo()) afterJump()
}

async function share() {
  const url = window.location.origin + route.fullPath
  const names = game.livingCast().slice(0, 3).join(', ')
  await copyToClipboard(`Meet my chess crew — ${names} and the gang. Take them on:\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  const m = /^(\d)\.(.+)$/.exec(p)
  if (m) {
    level.value = Math.min(6, Math.max(1, Number(m[1])))
    code.value = m[2]
  } else {
    syncUrl()
  }
  // Optional `?fen=` sets up a specific position (shareable puzzles / testing);
  // only honoured on the initial mount — a New Game always starts fresh.
  const fen = typeof route.query.fen === 'string' ? route.query.fen : undefined
  start(fen)
})
onBeforeUnmount(() => {
  engine.dispose()
  clearBanter()
  if (idleTimer) clearTimeout(idleTimer)
  if (pressTimer) clearTimeout(pressTimer)
  if (fxTimer) clearTimeout(fxTimer)
  if (followUpTimer) clearTimeout(followUpTimer)
  if (smackTimer) clearTimeout(smackTimer)
  clearGraveyardFx()
  cueTimers.forEach((t) => clearTimeout(t))
})
</script>

<template>
  <v-container class="py-6" max-width="1000">
    <GameToolbar title="Wizard Chess" shareable @share="share">
      <template #intro>
        Ordinary chess, extraordinary pieces. Every one of your soldiers has a name and a temper —
        and the occasional strong opinion about where it will and won't go.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">
              Difficulty: {{ level }} — {{ LEVEL_NAMES[level] }}
            </label>
            <v-slider
              :model-value="level"
              :min="1"
              :max="6"
              :step="1"
              hide-details
              density="compact"
              thumb-label
              @update:model-value="setLevel"
            />
          </div>
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Chattiness</label>
            <v-slider v-model="settings.chatter" :min="0" :max="1" :step="0.1" hide-details density="compact" />
          </div>
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Animation</label>
            <v-slider v-model="settings.animation" :min="0" :max="1" :step="0.1" hide-details density="compact" />
          </div>
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Hints &amp; opinions</label>
            <v-slider v-model="settings.agency" :min="0" :max="1" :step="0.1" hide-details density="compact" />
          </div>
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Chaos</label>
            <v-slider v-model="settings.chaos" :min="0" :max="1" :step="0.1" hide-details density="compact" color="secondary" />
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
      <template #info>
        <h3>The idea</h3>
        <p>
          It's real chess under the hood — you play White, the engine plays Black. But your pieces
          are <em>characters</em> with names, temperaments, moods and relationships.
        </p>
        <h3>How to play</h3>
        <ul>
          <li>Tap one of your pieces to select it; its legal moves light up. Tap a target to move.</li>
          <li>The first time you pick up a piece, it introduces itself in the table talk.</li>
          <li>Pawns always promote to a queen, for simplicity.</li>
        </ul>
        <h3>Pieces with opinions</h3>
        <ul>
          <li>A <span class="k">timid</span> piece may refuse a dangerous square — tap again to insist.</li>
          <li>Send someone to their doom and they'll <span class="k">flinch</span> before obeying.</li>
          <li>Now and then a bold piece <span class="k">volunteers</span> for a move it likes.</li>
          <li>The cowardly <span class="k">tremble</span> when cornered; the restless <span class="k">fidget</span>; grudges <span class="k">smoulder</span>.</li>
        </ul>
        <h3>Team trust</h3>
        <ul>
          <li>Your army keeps a <span class="k">trust</span> meter (starts at 50, persists between games). It tracks how the game is going — being ahead on material lifts it, losing pieces drops it.</li>
          <li>Low trust → pieces argue more and shout <span class="k">bad advice</span>. High trust → they follow orders without a word.</li>
          <li>The fallen are <span class="k">dragged off</span> to the nearest edge of the board and rest there.</li>
          <li>Made a mess? <span class="k">Undo</span> / <span class="k">redo</span> under the board take back your move (and the reply).</li>
        </ul>
        <h3>Feature tour (see everything fast)</h3>
        <p>Open settings (⚙): Difficulty <span class="k">1</span>, Chaos and Hints to <span class="k">max</span>. New game, then:</p>
        <ul>
          <li>Tap your <span class="k">g1 knight</span> — a dashed purple square appears; tap it for a jetpack leap.</li>
          <li><span class="k">Long-press</span> (or right-click) any piece for its character sheet.</li>
          <li>Move your <span class="k">queen next to an enemy pawn</span> — it balks; tap again to insist.</li>
          <li>Capture something — hear the taunt and watch it get hauled off to the edge.</li>
          <li>Dawdle ~15s on your turn — a piece heckles you.</li>
        </ul>
        <p>Cold feet, tantrums, defections and vengeance are <em>emergent</em> — max Chaos makes them likely within a few captures.</p>
        <h3>Difficulty</h3>
        <p>Higher levels search deeper and stop blundering. <span class="k">Ruthless</span> thinks the longest.</p>
        <h3>Sharing</h3>
        <p>The share link carries a seed — with the engine now deterministic, a friend gets the exact same cast <em>and</em> the same game if they play your moves.</p>
      </template>
    </GameToolbar>

    <div class="wc-layout">
      <div class="wc-board-col">
        <div class="d-flex align-center justify-space-between mb-2" style="min-height: 28px">
          <div class="text-body-2" data-testid="status">
            <v-icon v-if="thinking" icon="mdi-loading" class="spin" size="small" />
            {{ status }}
          </div>
        </div>

        <!-- frame reserves a gutter all round for the edge graveyard -->
        <div class="board-frame">
          <div class="board" :class="{ waiting: !canPlay }">
            <!-- squares: colours, highlights, dots, clicks -->
            <div
              v-for="(cell, i) in 64"
              :key="i"
              class="sq"
              :data-square="squareOf(i)"
              :class="{
                dark: ((i % 8) + Math.floor(i / 8)) % 2 === 1,
                sel: squareOf(i) === selectedSquare,
                from: squareOf(i) === game.lastFrom,
                to: squareOf(i) === game.lastTo,
              }"
              @click="onSquare(squareOf(i))"
              @pointerdown="startPress(squareOf(i))"
              @pointerup="endPress"
              @pointerleave="endPress"
              @pointercancel="endPress"
              @contextmenu.prevent="openSheetAt(squareOf(i))"
            >
              <!-- special rings outrank the plain move dot (an entourage/rage target
                   can ALSO be a legal square — the stunt is what a tap commits) -->
              <span v-if="squareOf(i) === coaxSquare" class="dot dot--coax" title="Coax back to post"></span>
              <span v-else-if="squareOf(i) === reprimandSquare" class="dot dot--reprimand" title="Send the cheat home"></span>
              <span v-else-if="chaosTargets.has(squareOf(i))" class="dot" :class="rageOffer ? 'dot--rage' : 'dot--chaos'"></span>
              <span v-else-if="captureTargets.has(squareOf(i))" class="dot dot--capture"></span>
              <span v-else-if="legalTargets.has(squareOf(i))" class="dot"></span>
            </div>

            <span v-if="checkSquare" class="check-ring" :style="checkStyle"></span>

            <!-- lingering stunt FX: ghost at origin, ring at destination, label -->
            <template v-if="stuntFx">
              <span v-if="stuntFx.from" class="stunt-ring stunt-ring--from" :style="fxRingStyle(stuntFx.from)"></span>
              <span class="stunt-ring" :class="'fx-' + stuntFx.kind" :style="fxRingStyle(stuntFx.to)"></span>
              <span class="stunt-label" :class="'fx-' + stuntFx.kind" :style="fxLabelStyle(stuntFx.to)">{{
                FX_LABEL[stuntFx.kind]
              }}</span>
            </template>

            <!-- pieces: animated overlay -->
            <TransitionGroup name="pmove" tag="div" class="pieces">
              <span
                v-for="p in piecesList"
                :key="p.id"
                class="piece-box"
                :data-piece="p.square"
                :class="[cueClass(p.id), { talking: !!bubbleFor(p.id), tugging: tuggingIds.has(p.id) }]"
                :style="pieceStyle(p)"
              >
                <img
                  class="glyph"
                  :class="[p.colorClass, animClass(p.square), stateClass(p.square)]"
                  :src="imgOf(p.color, p.type)"
                  :alt="`${p.colorClass} ${TYPE_NAME[p.type]}`"
                  draggable="false"
                />
                <!-- speech bubble, pinned to the speaking piece; tap to dismiss -->
                <div
                  v-if="bubbleFor(p.id)"
                  class="bubble"
                  :class="'tone-' + bubbleFor(p.id)!.tone"
                  title="Tap to dismiss"
                  @click.stop="clearBubble(p.id)"
                  @pointerdown.stop
                >
                  {{ bubbleFor(p.id)!.text }}
                </div>
                <!-- stunt accessories: worn while an offer is up or the FX lingers -->
                <svg v-if="accessoryOf(p) === 'flame'" class="acc acc-flame" viewBox="5.5 11 13 19.5" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M12 30 C6 24 7 18 12 12 C17 18 18 24 12 30 Z" fill="#f97316" />
                  <path d="M12 28 C9 24 9.5 20 12 16 C14.5 20 15 24 12 28 Z" fill="#fbbf24" />
                  <path d="M12 26 C10.6 23.5 10.8 21 12 19 C13.2 21 13.4 23.5 12 26 Z" fill="#fef3c7" />
                </svg>
                <svg v-else-if="accessoryOf(p) === 'glasses'" class="acc acc-glasses" viewBox="0 0 40 14" aria-hidden="true">
                  <circle cx="10" cy="7" r="6" fill="rgba(30,41,59,0.35)" stroke="#0f172a" stroke-width="2.4" />
                  <circle cx="30" cy="7" r="6" fill="rgba(30,41,59,0.35)" stroke="#0f172a" stroke-width="2.4" />
                  <line x1="16" y1="7" x2="24" y2="7" stroke="#0f172a" stroke-width="2.4" />
                  <line x1="0" y1="5" x2="4" y2="6" stroke="#0f172a" stroke-width="2.4" />
                  <line x1="40" y1="5" x2="36" y2="6" stroke="#0f172a" stroke-width="2.4" />
                </svg>
                <svg v-else-if="accessoryOf(p) === 'hat'" class="acc acc-hat" viewBox="0 0 36 18" aria-hidden="true">
                  <ellipse cx="18" cy="15" rx="17" ry="3" fill="#0f172a" />
                  <rect x="9" y="2" width="18" height="13" rx="2" fill="#1e293b" />
                  <rect x="9" y="10" width="18" height="3" fill="#7f1d1d" />
                </svg>
                <svg v-else-if="accessoryOf(p) === 'banner'" class="acc acc-banner" viewBox="0 0 20 30" aria-hidden="true">
                  <line x1="3" y1="0" x2="3" y2="30" stroke="#78350f" stroke-width="2.6" />
                  <path d="M4 1 L19 5 L4 11 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1" />
                </svg>
              </span>
            </TransitionGroup>

            <!-- comic-book capture burst -->
            <span v-if="smack" class="smack" :style="smackStyle(smack.square)">{{ smack.word }}</span>

            <!-- endgame banner: unmissable -->
            <div v-if="endBanner" class="endgame" :class="endBanner.cls">
              <div class="endgame-title">{{ endBanner.title }}</div>
              <div class="endgame-sub">{{ endBanner.sub }}</div>
            </div>
          </div>

          <!-- edge graveyard: the fallen rest just off the board (under the board
               layer, out in the gutters) -->
          <div class="graves">
            <img
              v-for="g in restingGraves"
              :key="g.id"
              class="grave-piece"
              :class="g.color === 'w' ? 'ours' : 'theirs'"
              :src="imgOf(g.color, g.type)"
              :style="graveStyle(g)"
              :title="`${g.name} — ${g.color === 'w' ? 'yours' : 'enemy'} ${TYPE_NAME[g.type]}`"
              draggable="false"
            />
          </div>
          <!-- a fresh casualty holds on its square a beat, then hauls out to its
               slot — rendered above the board so it's visible the whole way -->
          <div class="transit-layer">
            <span
              v-for="t in transits"
              :key="'t-' + t.id"
              class="grave-transit"
              :class="[t.color === 'w' ? 'ours' : 'theirs', t.phase]"
              :style="transitStyle(t)"
            >
              <span class="haul-rope"></span>
              <img :src="imgOf(t.color, t.type)" :alt="TYPE_NAME[t.type]" draggable="false" />
            </span>
          </div>
        </div>

        <div class="d-flex justify-center ga-2 mt-3">
          <v-btn variant="tonal" size="small" icon="mdi-undo" :disabled="!canUndo" title="Undo" @click="doUndo" />
          <v-btn variant="tonal" size="small" icon="mdi-redo" :disabled="!canRedo" title="Redo" @click="doRedo" />
          <v-btn variant="tonal" size="small" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </div>

      <div class="wc-log-col">
        <div class="trust">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-overline text-medium-emphasis">Team trust</span>
            <span class="trust-label" :style="{ color: trustColor }">{{ trustLabel }} · {{ trustPct }}</span>
          </div>
          <v-progress-linear :model-value="trustPct" :color="trustColor" height="8" rounded bg-color="rgba(148,163,184,0.2)" />
          <div class="text-caption text-medium-emphasis mt-1">{{ trustHint }}</div>
        </div>

        <div class="text-overline text-medium-emphasis mb-1 mt-4">Table talk</div>
        <div class="talk">
          <p v-if="log.length === 0" class="text-medium-emphasis text-body-2 pa-2">
            Tap one of your pieces — they have opinions. Long-press any piece for its character sheet.
          </p>
          <div v-for="(u, i) in log" :key="i" class="talk-line">
            <span class="badge" :class="u.color === 'w' ? 'ours' : 'theirs'" :title="TYPE_FOR(u)">
              <img class="badge-img" :src="IMG_FOR(u)" :alt="TYPE_FOR(u)" draggable="false" />
            </span>
            <div class="talk-body">
              <span class="who" :class="u.color === 'w' ? 'ours' : 'theirs'">{{ u.name }}</span>
              <span class="ty">{{ TYPE_FOR(u) }}</span>
              <span class="stamp">{{ fmt(u.ts) }}</span>
              <div class="what">{{ u.text }}</div>
            </div>
          </div>
        </div>

        <div class="text-overline text-medium-emphasis mb-1 mt-4">Moves</div>
        <div class="moves">
          <p v-if="moveRows.length === 0" class="text-medium-emphasis text-body-2 pa-2">No moves yet.</p>
          <div v-for="(m, i) in moveRows" :key="i" class="move-row2" :class="{ chaos: m.chaos }">
            <span class="stamp">{{ m.time }}</span>
            <span class="move-dot" :class="m.side === 'w' ? 'ours' : 'theirs'"></span>
            <span v-if="m.chaos" class="chaos-pip"></span>
            <span class="move-san">{{ m.san }}</span>
          </div>
        </div>

      </div>
    </div>

    <!-- Character sheet -->
    <v-dialog v-model="sheetOpen" max-width="420">
      <v-card v-if="sheet" color="surface" rounded="lg">
        <v-card-title class="d-flex align-center ga-3">
          <img class="sheet-glyph" :src="imgOf(sheet.color, sheet.type)" :alt="TYPE_NAME[sheet.type]" draggable="false" />
          <div>
            <div>{{ sheet.name }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ sheet.color === 'w' ? 'Your' : 'Enemy' }} {{ TYPE_NAME[sheet.type] }}
            </div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="sheetOpen = false" />
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">“{{ sheet.intro }}”</p>

          <div class="text-overline mb-1">Personality (drag to reshape)</div>
          <div v-for="t in TRAITS" :key="t.key" class="mb-1">
            <label class="text-caption text-medium-emphasis">{{ t.label }}</label>
            <v-slider
              :model-value="sheet[t.key]"
              :min="0"
              :max="1"
              :step="0.05"
              hide-details
              density="compact"
              color="primary"
              @update:model-value="(v) => setTrait(t.key, v)"
            />
          </div>

          <div class="text-overline mb-2 mt-3">Mood right now</div>
          <div v-for="m in MOODS" :key="m.key" class="mood-row">
            <span class="mood-label text-caption text-medium-emphasis">{{ m.label }}</span>
            <v-progress-linear :model-value="sheet.mood[m.key] * 100" :color="m.color" height="8" rounded />
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Link copied — share your crew!</v-snackbar>
  </v-container>
</template>

<style scoped>
.slider-wrap {
  min-width: 220px;
}
.wc-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.wc-board-col {
  flex: 1 1 360px;
  max-width: 560px;
}
.wc-log-col {
  flex: 1 1 260px;
  min-width: 240px;
}

/* The frame is the square sizing box; it reserves an 8% gutter all round for the
   edge graveyard. Themed to the app's palette — a deep purple panel with a gold
   hairline — so the gutter has colour and the fallen (black ones especially)
   don't vanish into the dark background. */
.board-frame {
  position: relative;
  width: 100%;
  max-width: min(82vh, 600px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  padding: 0;
  border-radius: 16px;
  background: radial-gradient(circle at 50% 35%, #2c1e52 0%, #1a1330 78%);
  box-shadow:
    inset 0 0 0 1px rgba(250, 204, 21, 0.28),
    0 10px 34px rgba(2, 6, 23, 0.5);
}
.board {
  position: absolute;
  inset: 8%;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  border-radius: 6px;
  overflow: visible;
  box-shadow:
    0 0 0 2px rgba(250, 204, 21, 0.45),
    0 6px 22px rgba(2, 6, 23, 0.5);
  user-select: none;
}
/* Resting fallen: out in the gutters, below the board layer. Each sits on a
   soft gold-ringed chip so both colours read against the purple panel. */
.graves {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.grave-piece {
  position: absolute;
  width: 9%;
  height: 9%;
  transform: translate(-50%, -50%);
  object-fit: contain;
  /* A soft light halo (no hard ring) lifts the fallen — black pieces especially
     — off the dark purple gutter without looking like a clunky circle. */
  background: radial-gradient(circle, rgba(233, 232, 240, 0.34) 50%, transparent 72%);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
}
/* Hauling casualty: above the board so the short drag to the edge is visible. */
.transit-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}
.grave-transit {
  position: absolute;
  width: 10.5%;
  height: 10.5%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    left var(--drag-ms, 650ms) cubic-bezier(0.5, 0, 0.7, 0.5),
    top var(--drag-ms, 650ms) cubic-bezier(0.5, 0, 0.7, 0.5),
    width var(--drag-ms, 650ms) ease,
    height var(--drag-ms, 650ms) ease;
}
.grave-transit.drag {
  width: 9%;
  height: 9%;
}
.grave-transit img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(233, 232, 240, 0.28) 46%, transparent 68%);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
}
/* Being hauled: the piece tumbles and lurches on the rope so it reads as
   physically dragged, not slid on rails. */
.grave-transit.drag img {
  animation: haulWobble var(--drag-ms, 650ms) ease-in-out;
}
@keyframes haulWobble {
  0% {
    transform: rotate(0deg) translateY(0);
  }
  22% {
    transform: rotate(-15deg) translateY(6%);
  }
  50% {
    transform: rotate(11deg) translateY(-4%);
  }
  74% {
    transform: rotate(-8deg) translateY(3%);
  }
  100% {
    transform: rotate(4deg) translateY(0);
  }
}
/* a lasso loop around the piece being hauled off */
.grave-transit::before {
  content: '';
  position: absolute;
  left: 12%;
  top: 34%;
  width: 76%;
  height: 30%;
  border: 3px solid #d97706;
  border-radius: 50%;
  z-index: 1;
}
/* the taut rope, pointing the way the piece is being yanked (toward its slot) */
.haul-rope {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 120%;
  height: 4px;
  transform-origin: 0 50%;
  transform: rotate(var(--rope-angle, 0deg));
  background: repeating-linear-gradient(90deg, #d97706 0 6px, #92400e 6px 12px);
  opacity: 0;
  border-radius: 2px;
}
.grave-transit.drag .haul-rope {
  opacity: 0.95;
}
/* The captor stays on the square and HEAVES on the rope while its victim is
   dragged off — so there's visibly a dragging piece, not just a dragged one. */
.piece-box.tugging {
  z-index: 5;
  animation: heave 0.42s ease-in-out infinite;
}
@keyframes heave {
  0%,
  100% {
    transform: rotate(-7deg) scale(1.04);
  }
  50% {
    transform: rotate(6deg) scale(0.98);
  }
}
/* Board palette: warm gold parchment + muted purple, matching the app's
   purple/gold theme (green replaced). */
.sq {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #efe3c0;
  cursor: pointer;
}
.sq.dark {
  background: #6b5498;
}
.sq.sel {
  box-shadow: inset 0 0 0 3px #facc15;
}
.sq.from,
.sq.to {
  background-image: linear-gradient(rgba(250, 204, 21, 0.42), rgba(250, 204, 21, 0.42));
}
.dot {
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.4);
  pointer-events: none;
}
/* A chaos move on offer: a distinctive dashed purple ring. */
.dot--chaos {
  width: 62%;
  height: 62%;
  background: rgba(192, 132, 252, 0.18);
  border: 3px dashed #c084fc;
  animation: chaosPulse 1.1s ease-in-out infinite;
}
@keyframes chaosPulse {
  50% {
    border-color: #e9d5ff;
    transform: scale(1.08);
  }
}
/* "Coax back to your post" — a friendly green target. */
.dot--coax {
  width: 62%;
  height: 62%;
  background: rgba(34, 197, 94, 0.18);
  border: 3px dashed #22c55e;
  animation: chaosPulse 1.1s ease-in-out infinite;
}
/* "Send the cheat home" — a gold rule-enforcement target on the enemy's home. */
.dot--reprimand {
  width: 66%;
  height: 66%;
  background: rgba(250, 204, 21, 0.16);
  border: 3px dashed #facc15;
  animation: chaosPulse 0.9s ease-in-out infinite;
}
/* Rage-strike target — an angry red ring around the enemy about to be smashed. */
.dot--rage {
  width: 74%;
  height: 74%;
  background: rgba(239, 68, 68, 0.16);
  border: 3px dashed #ef4444;
  animation: chaosPulse 0.7s ease-in-out infinite;
}
/* A capture: four corner triangles closing in on the target square (cleaner than
   a ring, and it doesn't fight the piece art). Colour flips per square so it
   reads on both the parchment and the purple. */
.dot--capture {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background:
    linear-gradient(to bottom right, var(--capc) 0 22%, transparent 22%) top left / 42% 42% no-repeat,
    linear-gradient(to bottom left, var(--capc) 0 22%, transparent 22%) top right / 42% 42% no-repeat,
    linear-gradient(to top right, var(--capc) 0 22%, transparent 22%) bottom left / 42% 42% no-repeat,
    linear-gradient(to top left, var(--capc) 0 22%, transparent 22%) bottom right / 42% 42% no-repeat;
  --capc: rgba(24, 18, 43, 0.5);
}
.sq.dark .dot--capture {
  --capc: rgba(250, 240, 210, 0.6);
}

/* Lingering stunt FX: after any rule-breaking moment, a ghost ring marks where
   it started, a bright ring marks where it landed, and a label names it — all
   lingering several seconds so the player can read what just happened. */
.stunt-ring {
  position: absolute;
  width: 12.5%;
  height: 12.5%;
  border-radius: 50%;
  box-shadow: inset 0 0 0 3px #c084fc;
  background: radial-gradient(circle, rgba(192, 132, 252, 0.28), transparent 70%);
  pointer-events: none;
  z-index: 2;
  animation: fxFade 5.5s ease-out forwards;
}
.stunt-ring--from {
  box-shadow: inset 0 0 0 2px rgba(192, 132, 252, 0.5);
  background: none;
}
.stunt-ring.fx-rage,
.stunt-ring.fx-tantrum {
  box-shadow: inset 0 0 0 3px #ef4444;
  background: radial-gradient(circle, rgba(239, 68, 68, 0.3), transparent 70%);
}
.stunt-ring.fx-coldfeet {
  box-shadow: inset 0 0 0 3px #60a5fa;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.28), transparent 70%);
}
.stunt-ring.fx-telegraph {
  animation:
    chaosPulse 0.9s ease-in-out infinite,
    fxFade 5.5s ease-out forwards;
}
.stunt-label {
  position: absolute;
  transform: translate(var(--tx, -50%), -130%);
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(88, 28, 135, 0.92);
  color: #f3e8ff;
  font-size: clamp(0.6rem, 1.9vw, 0.8rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
  z-index: 6;
  animation: fxFade 5.5s ease-out forwards;
}
.stunt-label.fx-rage,
.stunt-label.fx-tantrum {
  background: rgba(127, 29, 29, 0.92);
  color: #fee2e2;
}
.stunt-label.fx-coldfeet {
  background: rgba(30, 58, 138, 0.92);
  color: #dbeafe;
}
@keyframes fxFade {
  0%,
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* Comic-book capture burst: a POW!/WHAM! starburst at the point of violence. */
.smack {
  position: absolute;
  transform: translate(-50%, -50%) rotate(-7deg);
  padding: 10px 16px;
  font-size: clamp(0.9rem, 3.2vw, 1.5rem);
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.03em;
  color: #7f1d1d;
  background: #fbbf24;
  border: 3px solid #dc2626;
  clip-path: polygon(
    50% 0%, 61% 12%, 76% 4%, 78% 20%, 95% 18%, 88% 33%, 100% 42%, 88% 53%,
    97% 68%, 80% 68%, 80% 86%, 65% 78%, 55% 95%, 46% 79%, 30% 90%, 30% 72%,
    12% 76%, 20% 60%, 0% 52%, 13% 40%, 3% 26%, 21% 26%, 20% 8%, 37% 15%
  );
  pointer-events: none;
  z-index: 7;
  animation: smackPop 1.3s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
@keyframes smackPop {
  0% {
    transform: translate(-50%, -50%) rotate(-7deg) scale(0.2);
    opacity: 0;
  }
  18% {
    transform: translate(-50%, -50%) rotate(-7deg) scale(1.18);
    opacity: 1;
  }
  30% {
    transform: translate(-50%, -50%) rotate(-7deg) scale(1);
  }
  75% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) rotate(-7deg) scale(1);
    opacity: 0;
  }
}

/* Stunt accessories — worn while the FX lingers, so the story is on the piece. */
.acc {
  position: absolute;
  pointer-events: none;
  z-index: 3;
}
.acc-flame {
  width: 58%;
  height: 68%;
  left: 21%;
  bottom: -44%;
  transform-origin: 50% 0%;
  filter: drop-shadow(0 0 6px rgba(251, 146, 60, 0.8));
  animation: flicker 0.22s ease-in-out infinite alternate;
}
@keyframes flicker {
  from {
    transform: scaleY(1) scaleX(1);
  }
  to {
    transform: scaleY(1.25) scaleX(0.88);
  }
}
.acc-glasses {
  width: 62%;
  left: 19%;
  top: 20%;
}
.acc-hat {
  width: 66%;
  left: 17%;
  top: -16%;
}
.acc-banner {
  width: 42%;
  height: 64%;
  left: 62%;
  top: -26%;
  animation: bannerWave 1.1s ease-in-out infinite;
  transform-origin: 15% 100%;
}
@keyframes bannerWave {
  50% {
    transform: rotate(6deg);
  }
}

/* Endgame banner: the game being over is unmissable. */
.endgame {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.55);
  z-index: 8;
  pointer-events: none;
  animation: endgameIn 0.7s cubic-bezier(0.2, 1.3, 0.4, 1) both;
}
.endgame-title {
  font-size: clamp(2.2rem, 9vw, 4rem);
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.05em;
  padding: 6px 28px;
  border-radius: 14px;
  transform: rotate(-4deg);
}
.endgame.win .endgame-title {
  color: #052e16;
  background: #4ade80;
  border: 4px solid #166534;
  box-shadow: 0 6px 30px rgba(74, 222, 128, 0.45);
}
.endgame.lose .endgame-title {
  color: #fef2f2;
  background: #dc2626;
  border: 4px solid #7f1d1d;
  box-shadow: 0 6px 30px rgba(220, 38, 38, 0.45);
}
.endgame.draw .endgame-title {
  color: #f1f5f9;
  background: #475569;
  border: 4px solid #1e293b;
}
.endgame-sub {
  font-size: clamp(0.85rem, 2.6vw, 1.1rem);
  font-weight: 700;
  color: #f8fafc;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
@keyframes endgameIn {
  0% {
    opacity: 0;
    transform: scale(1.4);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
.check-ring {
  position: absolute;
  width: 12.5%;
  height: 12.5%;
  border-radius: 50%;
  box-shadow: inset 0 0 0 3px #ef4444;
  background: radial-gradient(circle, rgba(239, 68, 68, 0.35), transparent 70%);
  pointer-events: none;
  z-index: 1;
}

/* Pieces overlay */
.pieces {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.piece-box {
  position: absolute;
  width: 12.5%;
  height: 12.5%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.glyph {
  width: 88%;
  height: 88%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.4));
}
/* Power-up states shown with visual treatment, not emoji: vengeful pieces get a
   red aura (reinforced by the anim-angry fume); the spooked look faded. */
.glyph.state-vengeful {
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.95)) drop-shadow(0 2px 2px rgba(15, 23, 42, 0.4));
}
.glyph.state-spooked {
  opacity: 0.55;
  filter: grayscale(0.6) drop-shadow(0 2px 2px rgba(15, 23, 42, 0.4));
}
/* A caught cheat pulses gold — the player can march it home. */
.glyph.state-cheated {
  animation: cheatPulse 0.8s ease-in-out infinite;
}
@keyframes cheatPulse {
  50% {
    filter: drop-shadow(0 0 7px rgba(250, 204, 21, 0.95)) drop-shadow(0 2px 2px rgba(15, 23, 42, 0.5));
  }
}
/* .white / .black remain as selector hooks (e2e + future styling); the art
   itself carries the colour now. */

/* Movement (FLIP). Duration comes from the piece's temperament/risk. */
.pmove-move {
  transition: transform var(--move-ms, 300ms) cubic-bezier(0.22, 0.61, 0.36, 1);
}
/* When a piece is captured it simply fades from the board — the edge-graveyard
   transit corpse (in its own layer) is what visibly gets hauled off, so the
   board copy just needs to bow out quickly without a jarring pop. */
.pmove-leave-active {
  z-index: 1;
  transition: opacity 0.25s ease-out;
}
.pmove-leave-to {
  opacity: 0;
}

/* Mood animations — capped to ~2 pieces by the controller, so rare by design.
   Anger is expressed as a red aura, never by recolouring the glyph. */
.glyph.anim-tremble {
  animation: tremble 0.13s linear infinite;
}
.glyph.anim-bob {
  animation: bob 0.9s ease-in-out infinite;
}
.glyph.anim-joy {
  animation: bounce 0.75s ease-in-out 4;
}
.glyph.anim-angry {
  animation: fume 0.5s ease-in-out infinite;
}
@keyframes tremble {
  25% {
    transform: translateX(-6%) rotate(-4deg);
  }
  75% {
    transform: translateX(6%) rotate(4deg);
  }
}
@keyframes bob {
  50% {
    transform: translateY(-14%);
  }
}
@keyframes bounce {
  50% {
    transform: translateY(-16%) scale(1.06);
  }
}
@keyframes fume {
  50% {
    transform: scale(1.08);
    filter: drop-shadow(0 0 4px #ef4444) drop-shadow(0 0 2px #b91c1c);
  }
}

/* One-shot resistance cues on the whole piece. */
.piece-box.cue-shake {
  animation: shakeNo 0.45s ease;
}
.piece-box.cue-hop {
  animation: hopBack 0.48s ease;
}
@keyframes shakeNo {
  20% {
    transform: translateX(-16%) rotate(-6deg);
  }
  60% {
    transform: translateX(16%) rotate(6deg);
  }
}
@keyframes hopBack {
  40% {
    transform: translateY(-26%);
  }
}

/* A talking piece floats above its neighbours so its bubble is never clipped. */
.piece-box.talking {
  z-index: 6;
}
/* Bubble is a CHILD of the piece box, so it tracks the piece as it moves and can
   never divorce from it. Centred above the piece; compact so it doesn't bury the
   board on a phone. */
.bubble {
  position: absolute;
  left: 50%;
  bottom: 104%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 150px;
  padding: 4px 9px;
  border-radius: 10px;
  font-size: 0.72rem;
  line-height: 1.25;
  text-align: center;
  /* Dark card with a tone-coloured edge — reads clearly over both the gold
     parchment and the muted-purple squares (the old pale-yellow bubble blended
     into the light squares). */
  color: #f8fafc;
  background: #221a38;
  border: 1.5px solid var(--tone, #fbbf24);
  box-shadow: 0 4px 14px rgba(2, 6, 23, 0.55);
  pointer-events: auto; /* tappable to dismiss */
  cursor: pointer;
  animation: pop 0.16s ease-out;
}
.tone-gloat { --tone: #fbbf24; }
.tone-sad { --tone: #94a3b8; }
.tone-afraid { --tone: #60a5fa; }
.tone-angry { --tone: #f87171; }
.tone-warm,
.tone-joy { --tone: #4ade80; }
.tone-calm { --tone: #c084fc; }
/* Tail pointing down at the speaker; matches the dark card + tone edge. */
.bubble::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  width: 11px;
  height: 11px;
  transform: translateX(-50%) rotate(45deg);
  background: #221a38;
  border-right: 1.5px solid var(--tone, #fbbf24);
  border-bottom: 1.5px solid var(--tone, #fbbf24);
  border-radius: 0 0 3px 0;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
}

.talk {
  max-height: 62vh;
  overflow-y: auto;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.35);
  padding: 6px;
}
.talk-line {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 7px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}
.badge {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 18px;
  line-height: 1;
}
.badge.ours {
  background: rgba(253, 230, 138, 0.16);
  color: #fde68a;
}
.badge.theirs {
  background: rgba(252, 165, 165, 0.16);
  color: #fca5a5;
}
.badge-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.talk-body {
  min-width: 0;
}
.who {
  font-weight: 700;
  margin-right: 6px;
}
.who.ours { color: #fde68a; }
.who.theirs { color: #fca5a5; }
.ty {
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.9);
}
.what {
  color: #f1f5f9;
  font-size: 0.9rem;
  line-height: 1.3;
}
.moves {
  max-height: 22vh;
  overflow-y: auto;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.35);
  padding: 6px 8px;
}
.trust-label {
  font-size: 0.78rem;
  font-weight: 700;
}
.chaos-pip {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #c084fc;
  transform: rotate(45deg);
}
.move-row2 {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 0.85rem;
}
.move-row2 .move-san {
  color: #e2e8f0;
}
.move-row2.chaos .move-san {
  color: #d8b4fe;
  font-weight: 600;
}
.move-dot {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.move-dot.ours {
  background: #f8fafc;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.6);
}
.move-dot.theirs {
  background: #1e293b;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.6);
}
.stamp {
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.7);
}
.talk-body .stamp {
  margin-left: 6px;
}
.sheet-glyph {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
}
.mood-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.mood-label {
  flex: 0 0 84px;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Phone: bubbles shrink so a single line of chatter can't bury the board. */
@media (max-width: 560px) {
  .bubble {
    max-width: 108px;
    font-size: 0.62rem;
    padding: 3px 6px;
    border-radius: 8px;
  }
}

/* Respect motion sensitivity: still the fidgets and the travel slide, but keep
   anger legible as a static red aura (and the spinner, which signals activity). */
@media (prefers-reduced-motion: reduce) {
  .glyph.anim-tremble,
  .glyph.anim-bob,
  .glyph.anim-joy,
  .glyph.anim-angry,
  .piece-box.cue-shake,
  .piece-box.cue-hop {
    animation: none !important;
  }
  .pmove-move,
  .grave-transit {
    transition: none !important;
  }
  .stunt-ring,
  .stunt-ring.fx-telegraph,
  .stunt-label,
  .acc-flame,
  .acc-banner,
  .grave-transit.drag img,
  .piece-box.tugging,
  .glyph.state-cheated,
  .endgame {
    animation: none !important;
  }
  .smack {
    animation: none !important;
    opacity: 1;
  }
  .glyph.anim-angry {
    filter: drop-shadow(0 0 3px #ef4444);
  }
}
</style>
