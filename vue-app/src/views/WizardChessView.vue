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
import { WizardGame } from '@/services/chess/game'
import { TYPE_NAME } from '@/services/chess/profiles'
import { loadSettings, saveSettings } from '@/services/chess/settings'
import type { Color, PieceType, Square, Utterance } from '@/services/chess/types'

const route = useRoute()
const router = useRouter()

// U+FE0E (text variation selector) forces monochrome text rendering. Without it,
// iOS/Apple render the pawn (U+265F) as a colour emoji that ignores our `color`,
// so pawns showed up as black images while every other piece was styled. Applied
// to all glyphs so the whole set renders consistently as text we can colour.
const VS = '\uFE0E'
const GLYPH: Record<PieceType, string> = {
  p: '♟' + VS,
  n: '♞' + VS,
  b: '♝' + VS,
  r: '♜' + VS,
  q: '♛' + VS,
  k: '♚' + VS,
}
const LEVEL_NAMES = ['', 'Novice', 'Casual', 'Steady', 'Sharp', 'Cunning', 'Ruthless']

const engine = new Engine()
const initialSeed = randomSeed()
const game = new WizardGame(initialSeed)

// Player-tunable scalers, shared live with the controller and persisted.
const settings = ref(loadSettings())
game.settings = settings.value
watch(settings, (s) => saveSettings(s), { deep: true })

const code = ref(initialSeed)
const level = ref(3)
const version = ref(0)
const snackbar = ref(false)
const bump = () => (version.value += 1)

// ── Paced banter ────────────────────────────────────────────────────────────
interface Bubble extends Utterance {
  bid: number
}
type LogLine = Utterance & { ts: number }
const bubbles = ref<Bubble[]>([])
const log = ref<LogLine[]>([])
let queue: Utterance[] = []
let pumpTimer: ReturnType<typeof setTimeout> | null = null
let bubbleId = 0
const bubbleTimers = new Map<number, ReturnType<typeof setTimeout>>()

function enqueue(lines: Utterance[], delay = 0) {
  if (!lines.length) return
  queue.push(...lines)
  if (queue.length > 5) queue.splice(0, queue.length - 5)
  pump(delay)
}
function pump(delay: number) {
  if (pumpTimer) return
  const step = () => {
    const u = queue.shift()
    if (!u) {
      pumpTimer = null
      return
    }
    reveal(u)
    pumpTimer = setTimeout(step, 1000)
  }
  pumpTimer = setTimeout(step, delay)
}
function reveal(u: Utterance) {
  if (u.square) {
    const b: Bubble = { ...u, bid: bubbleId++ }
    bubbles.value.push(b)
    if (bubbles.value.length > 2) {
      const dropped = bubbles.value.shift()
      if (dropped) clearBubbleTimer(dropped.bid)
    }
    const t = setTimeout(() => {
      bubbles.value = bubbles.value.filter((x) => x.bid !== b.bid)
      bubbleTimers.delete(b.bid)
    }, 4400)
    bubbleTimers.set(b.bid, t)
  }
  log.value.unshift({ ...u, ts: game.now() })
  if (log.value.length > 40) log.value.length = 40
}
function clearBubbleTimer(id: number) {
  const t = bubbleTimers.get(id)
  if (t) clearTimeout(t)
  bubbleTimers.delete(id)
}
function clearBanter() {
  queue = []
  if (pumpTimer) {
    clearTimeout(pumpTimer)
    pumpTimer = null
  }
  bubbleTimers.forEach((t) => clearTimeout(t))
  bubbleTimers.clear()
  bubbles.value = []
  log.value = []
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

// ── Idle heckling ─────────────────────────────────────────────────────────
let idleTimer: ReturnType<typeof setTimeout> | null = null
function armIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  if (!game.canPlay) return
  idleTimer = setTimeout(() => {
    const u = game.idleHeckle()
    if (u) enqueue([u])
    armIdle()
  }, 16_000)
}

// ── Reactive, derived board ─────────────────────────────────────────────────
interface PieceView {
  id: string
  type: PieceType
  colorClass: 'white' | 'black'
  square: Square
}
const piecesList = computed<PieceView[]>(() => {
  version.value
  return Object.values(game.society.souls)
    .filter((s) => !s.captured && s.square)
    .map((s) => ({ id: s.id, type: s.type, colorClass: s.color === 'w' ? 'white' : 'black', square: s.square as Square }))
})
const animMap = computed(() => (version.value, game.animations()))
const selectedSquare = computed(() => (version.value, game.selected))
const legalTargets = computed(() => (version.value, game.legalTargets()))
const chaosTargets = computed(() => (version.value, new Set(game.chaosTargets())))
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
  if (game.chess.isCheckmate()) return game.turn === 'w' ? 'Checkmate — your king has fallen.' : 'Checkmate! You win. 🎉'
  if (game.chess.isStalemate()) return 'Stalemate — a stiff, awkward draw.'
  if (game.chess.isDraw()) return "It's a draw. Everyone lives to bicker another day."
  if (game.turn !== 'w' || game.aiThinking) return 'The enemy is plotting…'
  if (selectedName.value) return `Holding ${selectedName.value} — pick a square.`
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
function moveMs(p: PieceView): number {
  const s = game.society.souls[p.id]
  const bold = Math.max(s.persona.bravery ?? 0.5, s.persona.recklessness ?? 0.3)
  let ms = Math.round(500 - bold * 320) // ~180–500ms
  if (p.id === game.lastMoverId && game.lastMoveRisky) ms = Math.round(ms * 1.7)
  return ms
}
const pieceStyle = (p: PieceView) => {
  const { col, row } = rc(p.square)
  return { left: `${(col / 8) * 100}%`, top: `${(row / 8) * 100}%`, '--move-ms': `${moveMs(p)}ms` }
}
const bubbleStyle = (b: Bubble) => {
  const { col, row } = rc(b.square as Square)
  // Anchor the bubble near the piece and place its tail over the piece.
  const tx = col <= 1 ? '0%' : col >= 6 ? '-100%' : '-50%'
  const tail = col <= 1 ? '18px' : col >= 6 ? 'calc(100% - 18px)' : '50%'
  return { left: `${((col + 0.5) / 8) * 100}%`, top: `${(row / 8) * 100}%`, '--tx': tx, '--tail': tail }
}

// Table talk: resolve the speaker so each line can show its piece glyph + type.
const GLYPH_FOR = (u: Utterance): string => {
  const s = game.society.souls[u.soulId]
  return s ? GLYPH[s.type] : '•'
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
const STATE_ICON: Record<string, string> = { vengeful: '🔥', spooked: '😨' }
const pieceStates = computed(() => (version.value, game.states()))
const coaxSquare = computed(() => (version.value, game.coaxTarget()))
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
  enqueue(res.utterances, res.moved ? 650 : 0)
  bump()
  armIdle()
  if (res.moved) window.setTimeout(runAi, 420)
}

async function runAi() {
  if (game.gameOver) return
  game.aiThinking = true
  bump()
  // The enemy sometimes pulls a stunt instead of a normal move.
  const chaos = game.aiChaos()
  if (chaos) {
    game.aiThinking = false
    enqueue(chaos, 550)
    bump()
  } else {
    const best = await engine.bestMove(game.chess.fen(), level.value)
    game.aiThinking = false
    if (best && !game.gameOver) enqueue(game.aiApply(best), 650)
    bump()
  }
  // Occasionally a piece volunteers for a strong move it spotted.
  const s = game.suggest()
  if (s) {
    enqueue([s], 500)
    bump()
  }
  // A spontaneous stunt may fire (cold feet / tantrum / defection).
  const sp = game.spontaneousChaos()
  if (sp) {
    enqueue([sp], 400)
    bump()
  }
  armIdle()
}

// ── Setup ────────────────────────────────────────────────────────────────
const syncUrl = () => router.replace({ name: 'wizard-chess', params: { seed: `${level.value}.${code.value}` } })
function start() {
  game.reset(code.value)
  clearBanter()
  cueMap.value = {}
  bump()
  armIdle()
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
  start()
})
onBeforeUnmount(() => {
  engine.dispose()
  clearBanter()
  if (idleTimer) clearTimeout(idleTimer)
  if (pressTimer) clearTimeout(pressTimer)
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
            <label class="text-caption text-medium-emphasis">Chaos 🌀</label>
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
        <h3>Difficulty</h3>
        <p>Higher levels search deeper and stop blundering. <span class="k">Ruthless</span> thinks the longest.</p>
        <h3>Sharing</h3>
        <p>The share link carries a seed — your friend gets the exact same cast.</p>
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
            <span v-if="legalTargets.has(squareOf(i))" class="dot"></span>
            <span v-else-if="squareOf(i) === coaxSquare" class="dot dot--coax" title="Coax back to post"></span>
            <span v-else-if="chaosTargets.has(squareOf(i))" class="dot dot--chaos"></span>
          </div>

          <span v-if="checkSquare" class="check-ring" :style="checkStyle"></span>

          <!-- pieces: animated overlay -->
          <TransitionGroup name="pmove" tag="div" class="pieces">
            <span
              v-for="p in piecesList"
              :key="p.id"
              class="piece-box"
              :data-piece="p.square"
              :class="cueClass(p.id)"
              :style="pieceStyle(p)"
            >
              <span class="glyph" :class="[p.colorClass, animClass(p.square)]">{{ GLYPH[p.type] }}</span>
              <span v-if="STATE_ICON[pieceStates[p.square]]" class="power-icon">{{ STATE_ICON[pieceStates[p.square]] }}</span>
            </span>
          </TransitionGroup>

          <div
            v-for="b in bubbles"
            :key="b.bid"
            class="bubble"
            :class="['tone-' + b.tone, b.color === 'w' ? 'ours' : 'theirs']"
            :style="bubbleStyle(b)"
          >
            <span class="bubble-name">{{ b.name }}:</span> {{ b.text }}
          </div>
        </div>

        <div class="d-flex justify-center ga-2 mt-3">
          <v-btn variant="tonal" size="small" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </div>

      <div class="wc-log-col">
        <div class="text-overline text-medium-emphasis mb-1">Table talk</div>
        <div class="talk">
          <p v-if="log.length === 0" class="text-medium-emphasis text-body-2 pa-2">
            Tap one of your pieces — they have opinions. Long-press any piece for its character sheet.
          </p>
          <div v-for="(u, i) in log" :key="i" class="talk-line">
            <span class="badge" :class="u.color === 'w' ? 'ours' : 'theirs'" :title="TYPE_FOR(u)">{{ GLYPH_FOR(u) }}</span>
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
            <span class="move-san">{{ m.chaos ? '🌀 ' : '' }}{{ m.san }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Character sheet -->
    <v-dialog v-model="sheetOpen" max-width="420">
      <v-card v-if="sheet" color="surface" rounded="lg">
        <v-card-title class="d-flex align-center ga-3">
          <span class="sheet-glyph" :class="sheet.color === 'w' ? 'ours' : 'theirs'">{{ GLYPH[sheet.type] }}</span>
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

.board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  width: 100%;
  max-width: min(78vh, 560px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  border-radius: 10px;
  overflow: visible;
  box-shadow: 0 8px 30px rgba(2, 6, 23, 0.45);
  user-select: none;
  container-type: size;
}
.sq {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eeeed2;
  cursor: pointer;
}
.sq.dark {
  background: #6f9654;
}
.sq.sel {
  box-shadow: inset 0 0 0 3px #facc15;
}
.sq.from,
.sq.to {
  background-image: linear-gradient(rgba(250, 204, 21, 0.4), rgba(250, 204, 21, 0.4));
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
  font-size: 9cqmin;
  line-height: 1;
}
/* Power-up state badge (vengeful 🔥, spooked 😨) in the piece's top corner. */
.power-icon {
  position: absolute;
  top: 2%;
  right: 2%;
  font-size: 4.6cqmin;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}
.glyph.white {
  color: #f8fafc;
  text-shadow: 0 0 1px #0f172a, 0 1px 2px rgba(15, 23, 42, 0.9), 0 0 3px #1e293b;
}
.glyph.black {
  color: #1e293b;
  text-shadow: 0 0 1px #000, 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* Movement (FLIP). Duration comes from the piece's temperament/risk. */
.pmove-move {
  transition: transform var(--move-ms, 300ms) cubic-bezier(0.22, 0.61, 0.36, 1);
}
.pmove-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.pmove-leave-to {
  opacity: 0;
  transform: scale(0.35);
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

.bubble {
  position: absolute;
  transform: translate(var(--tx, -50%), -118%);
  max-width: 180px;
  padding: 6px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  line-height: 1.3;
  color: #0f172a;
  background: #fef9c3;
  box-shadow: 0 4px 14px rgba(2, 6, 23, 0.45);
  z-index: 5;
  pointer-events: none;
  animation: pop 0.18s ease-out;
}
.bubble-name {
  font-weight: 700;
  opacity: 0.75;
}
.tone-gloat { background: #fde68a; }
.tone-sad { background: #cbd5e1; }
.tone-afraid { background: #bfdbfe; }
.tone-angry { background: #fecaca; }
.tone-warm,
.tone-joy { background: #bbf7d0; }
/* Tail pointing down at the speaker; inherits the bubble's tone colour. */
.bubble::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: var(--tail, 50%);
  width: 12px;
  height: 12px;
  transform: translateX(-50%) rotate(45deg);
  background-color: inherit;
  border-radius: 0 0 3px 0;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translate(var(--tx, -50%), -98%) scale(0.9);
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
  max-height: 26vh;
  overflow-y: auto;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.35);
  padding: 6px 8px;
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
  font-size: 30px;
  line-height: 1;
}
.sheet-glyph.ours { color: #fde68a; }
.sheet-glyph.theirs { color: #fca5a5; }
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
  .pmove-move {
    transition: none !important;
  }
  .glyph.anim-angry {
    filter: drop-shadow(0 0 3px #ef4444);
  }
}
</style>
