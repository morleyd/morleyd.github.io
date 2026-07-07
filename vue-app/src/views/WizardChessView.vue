<script setup lang="ts">
/**
 * Wizard Chess — play a time-boxed negamax engine, but the real show is the
 * cast: every piece is a named character who banters, gloats, panics and holds
 * grudges. All game logic lives in the headless WizardGame controller; this
 * component renders it, drives the engine, and paces the chatter so it reads
 * like a conversation rather than a wall of text.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed } from '@/services/seed'
import { Engine } from '@/services/chess/engine'
import { WizardGame } from '@/services/chess/game'
import { TYPE_NAME } from '@/services/chess/profiles'
import type { Color, PieceType, Square, Utterance } from '@/services/chess/types'

const route = useRoute()
const router = useRouter()

const GLYPH: Record<PieceType, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
const LEVEL_NAMES = ['', 'Novice', 'Casual', 'Steady', 'Sharp', 'Cunning', 'Ruthless']

const engine = new Engine()
const initialSeed = randomSeed()
const game = new WizardGame(initialSeed)

const code = ref(initialSeed)
const level = ref(3)
const version = ref(0) // bumped on every state change to re-derive the board
const snackbar = ref(false)
const bump = () => (version.value += 1)

// ── Paced banter ────────────────────────────────────────────────────────────
interface Bubble extends Utterance {
  bid: number
}
const bubbles = ref<Bubble[]>([])
const log = ref<Utterance[]>([])
let queue: Utterance[] = []
let pumpTimer: ReturnType<typeof setTimeout> | null = null
let bubbleId = 0
const bubbleTimers = new Map<number, ReturnType<typeof setTimeout>>()

function enqueue(lines: Utterance[]) {
  if (!lines.length) return
  queue.push(...lines)
  if (queue.length > 6) queue.splice(0, queue.length - 6) // don't let banter pile up
  pump()
}
function pump() {
  if (pumpTimer) return
  const step = () => {
    const u = queue.shift()
    if (!u) {
      pumpTimer = null
      return
    }
    reveal(u)
    pumpTimer = setTimeout(step, 950)
  }
  step()
}
function reveal(u: Utterance) {
  if (u.square) {
    const b: Bubble = { ...u, bid: bubbleId++ }
    bubbles.value.push(b)
    if (bubbles.value.length > 3) {
      const dropped = bubbles.value.shift()
      if (dropped) clearBubbleTimer(dropped.bid)
    }
    const t = setTimeout(() => {
      bubbles.value = bubbles.value.filter((x) => x.bid !== b.bid)
      bubbleTimers.delete(b.bid)
    }, 4600)
    bubbleTimers.set(b.bid, t)
  }
  log.value.unshift(u)
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

// ── Derived, reactive board ─────────────────────────────────────────────────
interface Cell {
  square: Square
  type: PieceType
  color: Color
  name: string | null
  mood: string
}
const cells = computed<(Cell | null)[]>(() => {
  version.value
  return game.chess
    .board()
    .flat()
    .map((c) => {
      if (!c) return null
      const soul = game.soulAt(c.square)
      return {
        square: c.square,
        type: c.type as PieceType,
        color: c.color as Color,
        name: soul?.persona.name ?? null,
        mood: game.moodAt(c.square),
      }
    })
})
const selectedSquare = computed(() => (version.value, game.selected))
const legalTargets = computed(() => (version.value, game.legalTargets()))
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
  if (game.aiThinking) return 'The enemy is plotting…'
  if (selectedName.value) return `Holding ${selectedName.value} — pick a square.`
  if (game.chess.isCheck()) return 'You are in check!'
  return 'Your move.'
})

const FILES = 'abcdefgh'
const squareOf = (i: number): Square => FILES[i % 8] + (8 - Math.floor(i / 8))
const rc = (sq: Square) => ({ col: sq.charCodeAt(0) - 97, row: 8 - Number(sq[1]) })
const bubbleStyle = (b: Bubble) => {
  const { col, row } = rc(b.square as Square)
  const tx = col <= 1 ? '0%' : col >= 6 ? '-100%' : '-50%'
  return { left: `${((col + 0.5) / 8) * 100}%`, top: `${(row / 8) * 100}%`, '--tx': tx }
}
const checkStyle = computed(() => {
  if (!checkSquare.value) return {}
  const { col, row } = rc(checkSquare.value)
  return { left: `${(col / 8) * 100}%`, top: `${(row / 8) * 100}%` }
})

// ── Turn flow ────────────────────────────────────────────────────────────
function onSquare(square: Square) {
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
    })
  }
  enqueue(res.utterances)
  bump()
  if (res.moved) window.setTimeout(runAi, 420)
}

async function runAi() {
  if (game.gameOver) return
  game.aiThinking = true
  bump()
  const best = await engine.bestMove(game.chess.fen(), level.value)
  game.aiThinking = false
  if (best && !game.gameOver) enqueue(game.aiApply(best))
  bump()
}

// ── Setup ────────────────────────────────────────────────────────────────
const syncUrl = () => router.replace({ name: 'wizard-chess', params: { seed: `${level.value}.${code.value}` } })
function start() {
  game.reset(code.value)
  clearBanter()
  bump()
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
})
</script>

<template>
  <v-container class="py-6" max-width="1000">
    <GameToolbar title="Wizard Chess" shareable @share="share">
      <template #intro>
        Ordinary chess, extraordinary pieces. Every one of your soldiers has a name and a temper —
        they cheer, gloat, panic and hold grudges as the battle unfolds.
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
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
      <template #info>
        <h3>The idea</h3>
        <p>
          It's real chess under the hood — you play White, the engine plays Black. But your pieces
          are <em>characters</em>. Each has a name, personality traits, moods and relationships that
          shift as the game goes on.
        </p>
        <h3>How to play</h3>
        <ul>
          <li>Tap one of your pieces to select it; its legal moves light up. Tap a target to move.</li>
          <li>The first time you pick up a piece, it introduces itself in the table talk.</li>
          <li>Pawns always promote to a queen, for simplicity.</li>
        </ul>
        <h3>The cast</h3>
        <ul>
          <li>Pieces <span class="k">gloat</span> when they capture and give <span class="k">last words</span> when they fall.</li>
          <li>The timid <span class="k">panic</span> when threatened; the brave stand defiant.</li>
          <li>Idle pieces grow <span class="k">impatient</span> — watch them fidget, and some rooks work themselves into a proper rage.</li>
          <li>Lose a friend to an enemy piece and the survivors hold a <span class="k">grudge</span>.</li>
        </ul>
        <h3>Difficulty</h3>
        <p>Higher levels search deeper and stop blundering. <span class="k">Ruthless</span> thinks the longest.</p>
        <h3>Sharing</h3>
        <p>The share link carries a seed — your friend gets the exact same cast and personalities.</p>
      </template>
    </GameToolbar>

    <div class="wc-layout">
      <div class="wc-board-col">
        <div class="d-flex align-center justify-space-between mb-2" style="min-height: 28px">
          <div class="text-body-2">
            <v-icon v-if="thinking" icon="mdi-loading" class="spin" size="small" />
            {{ status }}
          </div>
        </div>

        <div class="board" :class="{ waiting: !canPlay }">
          <div
            v-for="(cell, i) in cells"
            :key="i"
            class="sq"
            :class="{
              dark: ((i % 8) + Math.floor(i / 8)) % 2 === 1,
              sel: squareOf(i) === selectedSquare,
              from: squareOf(i) === game.lastFrom,
              to: squareOf(i) === game.lastTo,
            }"
            @click="onSquare(squareOf(i))"
          >
            <span
              v-if="cell"
              class="piece"
              :class="[cell.color === 'w' ? 'white' : 'black', 'mood-' + cell.mood]"
              :title="cell.name || ''"
            >{{ GLYPH[cell.type] }}</span>
            <span v-if="legalTargets.has(squareOf(i))" class="dot" :class="{ cap: !!cell }"></span>
          </div>

          <span v-if="checkSquare" class="check-ring" :style="checkStyle"></span>

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
            Tap one of your pieces — they have opinions.
          </p>
          <div v-for="(u, i) in log" :key="i" class="talk-line" :class="'tone-' + u.tone">
            <span class="who" :class="u.color === 'w' ? 'ours' : 'theirs'">{{ u.name }}</span>
            <span class="what">{{ u.text }}</span>
          </div>
        </div>
      </div>
    </div>

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
.board.waiting {
  cursor: default;
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
.piece {
  font-size: 9cqmin;
  line-height: 1;
  pointer-events: none;
  will-change: transform;
}
.piece.white {
  color: #f8fafc;
  text-shadow: 0 0 1px #0f172a, 0 1px 2px rgba(15, 23, 42, 0.9), 0 0 3px #1e293b;
}
.piece.black {
  color: #1e293b;
  text-shadow: 0 0 1px #000, 0 1px 2px rgba(0, 0, 0, 0.5);
}
/* Personality shows in body language. */
.piece.mood-impatience {
  animation: bob 0.85s ease-in-out infinite;
}
.piece.mood-anger {
  animation: fume 0.5s ease-in-out infinite;
  color: #fecaca;
}
.piece.mood-anger.black {
  color: #7f1d1d;
}
.piece.mood-fear {
  animation: tremble 0.12s linear infinite;
}
.piece.mood-joy {
  animation: bounce 1.1s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-8%);
  }
}
@keyframes bounce {
  50% {
    transform: translateY(-12%) scale(1.05);
  }
}
@keyframes tremble {
  25% {
    transform: translateX(-4%) rotate(-3deg);
  }
  75% {
    transform: translateX(4%) rotate(3deg);
  }
}
@keyframes fume {
  50% {
    transform: scale(1.08);
    filter: drop-shadow(0 0 3px #ef4444);
  }
}
.dot {
  position: absolute;
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.4);
  pointer-events: none;
}
.dot.cap {
  width: 84%;
  height: 84%;
  background: transparent;
  border: 4px solid rgba(15, 23, 42, 0.4);
  border-radius: 50%;
}
.check-ring {
  position: absolute;
  width: 12.5%;
  height: 12.5%;
  border-radius: 50%;
  box-shadow: inset 0 0 0 3px #ef4444;
  background: radial-gradient(circle, rgba(239, 68, 68, 0.35), transparent 70%);
  pointer-events: none;
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
/* Tone colours — same palette for bubbles and the log accent. */
.tone-gloat { background: #fde68a; }
.tone-sad { background: #cbd5e1; }
.tone-afraid { background: #bfdbfe; }
.tone-angry { background: #fecaca; }
.tone-warm { background: #bbf7d0; }
.tone-joy { background: #bbf7d0; }
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
  padding: 6px 8px 6px 10px;
  border-left: 3px solid transparent;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 0.9rem;
}
.talk-line.tone-gloat { border-left-color: #eab308; }
.talk-line.tone-sad { border-left-color: #94a3b8; }
.talk-line.tone-afraid { border-left-color: #60a5fa; }
.talk-line.tone-angry { border-left-color: #ef4444; }
.talk-line.tone-warm,
.talk-line.tone-joy { border-left-color: #22c55e; }
.who {
  font-weight: 700;
  margin-right: 6px;
}
.who.ours {
  color: #fde68a;
}
.who.theirs {
  color: #fca5a5;
}
.what {
  color: #e2e8f0;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
