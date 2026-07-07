<script setup lang="ts">
/**
 * Wizard Chess — play a time-boxed negamax engine, but the real show is the
 * cast: every piece is a named character with a personality who banters, gloats,
 * panics and holds grudges as the game unfolds. Seeded, so a shared code brings
 * back the same crew and the same table talk.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Chess } from 'chess.js'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed, rngFromSeed } from '@/services/seed'
import { useSquareFit } from '@/composables/useSquareFit'
import { Engine } from '@/services/chess/engine'
import { applyMove, createSociety, scanBoard, soulAt, type Society } from '@/services/chess/social'
import { createDialogueState, introOf, speak, type DialogueState } from '@/services/chess/dialogue'
import type { Color, GameEvent, PieceType, Square, Utterance } from '@/services/chess/types'

const route = useRoute()
const router = useRouter()

// Board tops out around a phone width; the talk log sits beside/below it.
const { el: boardEl, px: boardPx } = useSquareFit(150)

const GLYPH: Record<PieceType, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
const LEVEL_NAMES = ['', 'Novice', 'Casual', 'Steady', 'Sharp', 'Cunning', 'Ruthless']

const engine = new Engine()
let chess = new Chess()
let society: Society = { souls: {}, bySquare: {}, ply: 0 }
let dialogue: DialogueState = createDialogueState()
let rng: () => number = Math.random

const code = ref('')
const level = ref(3)
const version = ref(0) // bumped after each move to re-derive the board
const selected = ref<Square | null>(null)
const lastFrom = ref<Square | null>(null)
const lastTo = ref<Square | null>(null)
const thinking = ref(false)
const status = ref('Your move. Drag your fate.')
const gameOver = ref(false)
const snackbar = ref(false)

interface Bubble {
  id: number
  square: Square
  color: Color
  text: string
}
const bubbles = ref<Bubble[]>([])
const log = ref<Utterance[]>([])
let bubbleId = 0
const bubbleTimers = new Map<number, ReturnType<typeof setTimeout>>()

// ── Derived board ───────────────────────────────────────────────────────────
interface Cell {
  square: Square
  type: PieceType
  color: Color
  name: string | null
}
const cells = computed<(Cell | null)[]>(() => {
  version.value // reactive dependency
  return chess
    .board()
    .flat()
    .map((c) => {
      if (!c) return null
      const soul = soulAt(society, c.square)
      return { square: c.square, type: c.type as PieceType, color: c.color as Color, name: soul?.persona.name ?? null }
    })
})

const legalTargets = computed<Set<Square>>(() => {
  version.value
  if (!selected.value) return new Set()
  const moves = chess.moves({ square: selected.value, verbose: true }) as unknown as { to: Square }[]
  return new Set(moves.map((m) => m.to))
})

const checkSquare = computed<Square | null>(() => {
  version.value
  if (!chess.isCheck()) return null
  const turn = chess.turn()
  for (const c of chess.board().flat()) if (c && c.type === 'k' && c.color === turn) return c.square
  return null
})

const FILES = 'abcdefgh'
const squareOf = (i: number): Square => FILES[i % 8] + (8 - Math.floor(i / 8))
const rc = (sq: Square) => ({ col: sq.charCodeAt(0) - 97, row: 8 - Number(sq[1]) })
const bubbleStyle = (b: Bubble) => {
  const { col, row } = rc(b.square)
  // Nudge the tail so edge bubbles don't spill off the board.
  const tx = col <= 1 ? '0%' : col >= 6 ? '-100%' : '-50%'
  return { left: `${((col + 0.5) / 8) * 100}%`, top: `${(row / 8) * 100}%`, '--tx': tx }
}
const checkStyle = computed(() => {
  if (!checkSquare.value) return {}
  const { col, row } = rc(checkSquare.value)
  return { left: `${(col / 8) * 100}%`, top: `${(row / 8) * 100}%` }
})

// ── Turn plumbing ─────────────────────────────────────────────────────────
const playerColor: Color = 'w'
const canInteract = computed(() => !gameOver.value && !thinking.value && chess.turn() === playerColor)

function pushBubble(u: Utterance) {
  if (!u.square) return
  const b: Bubble = { id: bubbleId++, square: u.square, color: u.color, text: u.text }
  bubbles.value.push(b)
  if (bubbles.value.length > 3) {
    const dropped = bubbles.value.shift()
    if (dropped) clearBubble(dropped.id, false)
  }
  const t = setTimeout(() => clearBubble(b.id), 4800)
  bubbleTimers.set(b.id, t)
}
function clearBubble(id: number, removeFromList = true) {
  const t = bubbleTimers.get(id)
  if (t) clearTimeout(t)
  bubbleTimers.delete(id)
  if (removeFromList) bubbles.value = bubbles.value.filter((b) => b.id !== id)
}

function voice(events: GameEvent[]) {
  const lines = speak(society, events, dialogue, rng, 2)
  for (const u of lines) {
    pushBubble(u)
    log.value.unshift(u)
  }
  if (log.value.length > 40) log.value.length = 40
}

/** Fold a played move into the social sim, surface banter, and refresh state. */
function afterMove(move: ReturnType<Chess['move']>) {
  if (!move) return
  const events = applyMove(society, {
    from: move.from,
    to: move.to,
    color: move.color as Color,
    piece: move.piece as PieceType,
    flags: move.flags,
    captured: move.captured as PieceType | undefined,
    promotion: move.promotion as PieceType | undefined,
  })

  const moverId = society.bySquare[move.to]
  if (chess.isCheckmate() && moverId) {
    events.push({ kind: 'checkmate', soulId: moverId, salience: 120 })
  } else if (chess.isCheck() && moverId) {
    events.push({ kind: 'check', soulId: moverId, salience: 54 })
  }

  voice([...events, ...scanBoard(society, chess)])

  lastFrom.value = move.from
  lastTo.value = move.to
  selected.value = null
  version.value += 1
  updateStatus()
}

function updateStatus() {
  if (chess.isCheckmate()) {
    gameOver.value = true
    status.value = chess.turn() === playerColor ? 'Checkmate — your king has fallen.' : 'Checkmate! You win. 🎉'
  } else if (chess.isStalemate()) {
    gameOver.value = true
    status.value = 'Stalemate — a stiff, awkward draw.'
  } else if (chess.isDraw()) {
    gameOver.value = true
    status.value = "It's a draw. Everyone lives to bicker another day."
  } else if (chess.isCheck()) {
    status.value = chess.turn() === playerColor ? 'You are in check!' : 'Check! The enemy king squirms.'
  } else {
    status.value = chess.turn() === playerColor ? 'Your move.' : 'The enemy is plotting…'
  }
}

async function aiMove() {
  if (gameOver.value) return
  thinking.value = true
  updateStatus()
  const best = await engine.bestMove(chess.fen(), level.value)
  thinking.value = false
  if (!best || gameOver.value) return
  try {
    afterMove(chess.move({ from: best.from, to: best.to, promotion: best.promotion ?? 'q' }))
  } catch {
    updateStatus()
  }
}

function onSquare(square: Square) {
  if (!canInteract.value) return
  const piece = chess.get(square)

  // Selecting one of your own pieces: highlight moves + say hello sometimes.
  if (piece && piece.color === playerColor) {
    if (selected.value === square) {
      selected.value = null
    } else {
      selected.value = square
      const soul = soulAt(society, square)
      if (soul && rng() < 0.5) {
        pushBubble({ soulId: soul.id, square, color: soul.color, name: soul.persona.name, text: introOf(soul) })
      }
    }
    return
  }

  // Committing a move to a highlighted target.
  if (selected.value && legalTargets.value.has(square)) {
    try {
      afterMove(chess.move({ from: selected.value, to: square, promotion: 'q' }))
      window.setTimeout(aiMove, 350)
    } catch {
      selected.value = null
    }
    return
  }

  selected.value = null
}

// ── Setup / lifecycle ─────────────────────────────────────────────────────
function start() {
  chess = new Chess()
  rng = rngFromSeed(`${code.value}`)
  society = createSociety(chess, rng)
  dialogue = createDialogueState()
  bubbles.value.forEach((b) => clearBubble(b.id, false))
  bubbles.value = []
  log.value = []
  selected.value = null
  lastFrom.value = null
  lastTo.value = null
  gameOver.value = false
  version.value += 1
  updateStatus()
}

const syncUrl = () => router.replace({ name: 'wizard-chess', params: { seed: `${level.value}.${code.value}` } })
function newGame() {
  code.value = randomSeed()
  syncUrl()
  start()
}
function setLevel(v: number) {
  level.value = v
  syncUrl()
}

const cast = computed(() => {
  version.value
  return Object.values(society.souls)
    .filter((s) => !s.captured && s.color === playerColor)
    .map((s) => s.persona.name)
})

async function share() {
  const url = window.location.origin + route.fullPath
  const names = cast.value.slice(0, 3).join(', ')
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
    code.value = randomSeed()
    syncUrl()
  }
  start()
})

onBeforeUnmount(() => {
  engine.dispose()
  bubbleTimers.forEach((t) => clearTimeout(t))
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
          <li>Tap a piece to hear it introduce itself.</li>
          <li>Pawns always promote to a queen, for simplicity.</li>
        </ul>
        <h3>The cast</h3>
        <ul>
          <li>Pieces <span class="k">gloat</span> when they capture and give <span class="k">last words</span> when they fall.</li>
          <li>The timid <span class="k">panic</span> when threatened; the brave stand defiant.</li>
          <li>Idle pieces grow <span class="k">impatient</span> — some rooks work themselves into a proper rage.</li>
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
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-body-1">
            <v-icon v-if="thinking" icon="mdi-loading" class="spin" size="small" />
            {{ status }}
          </div>
          <v-chip v-if="gameOver" color="primary" variant="flat" size="small">Game over</v-chip>
        </div>

        <div
          ref="boardEl"
          class="board"
          :style="{ width: boardPx + 'px', height: boardPx + 'px' }"
        >
          <div
            v-for="(cell, i) in cells"
            :key="i"
            class="sq"
            :class="{
              dark: ((i % 8) + Math.floor(i / 8)) % 2 === 1,
              sel: squareOf(i) === selected,
              from: squareOf(i) === lastFrom,
              to: squareOf(i) === lastTo,
            }"
            @click="onSquare(squareOf(i))"
          >
            <span
              v-if="cell"
              class="piece"
              :class="cell.color === 'w' ? 'white' : 'black'"
              :title="cell.name || ''"
            >{{ GLYPH[cell.type] }}</span>
            <span v-if="legalTargets.has(squareOf(i))" class="dot" :class="{ cap: !!cell }"></span>
          </div>

          <!-- highlight for the king in check -->
          <span v-if="checkSquare" class="check-ring" :style="checkStyle"></span>

          <!-- speech bubbles anchored over squares -->
          <div
            v-for="b in bubbles"
            :key="b.id"
            class="bubble"
            :class="b.color === 'w' ? 'ours' : 'theirs'"
            :style="bubbleStyle(b)"
          >{{ b.text }}</div>
        </div>

        <div class="d-flex justify-center ga-2 mt-3">
          <v-btn variant="tonal" size="small" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </div>

      <div class="wc-log-col">
        <div class="text-overline text-medium-emphasis mb-1">Table talk</div>
        <div class="talk">
          <p v-if="log.length === 0" class="text-medium-emphasis text-body-2 pa-2">
            Make a move — your pieces have opinions.
          </p>
          <div v-for="(u, i) in log" :key="i" class="talk-line">
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
/* Give the column an independent width (flex basis) so useSquareFit measures a
   real box, not the board it is trying to size. */
.wc-board-col {
  flex: 1 1 340px;
  max-width: 520px;
}
.wc-log-col {
  flex: 1 1 260px;
  min-width: 240px;
}

.board {
  position: relative;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  border-radius: 10px;
  overflow: visible;
  box-shadow: 0 8px 30px rgba(2, 6, 23, 0.45);
  user-select: none;
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
  background-image: linear-gradient(rgba(250, 204, 21, 0.35), rgba(250, 204, 21, 0.35));
}
.piece {
  font-size: min(7.5vw, 40px);
  line-height: 1;
  pointer-events: none;
}
.piece.white {
  color: #f8fafc;
  text-shadow: 0 0 1px #0f172a, 0 1px 2px rgba(15, 23, 42, 0.9), 0 0 3px #1e293b;
}
.piece.black {
  color: #1e293b;
  text-shadow: 0 0 1px #000, 0 1px 2px rgba(0, 0, 0, 0.5);
}
.dot {
  position: absolute;
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.35);
  pointer-events: none;
}
.dot.cap {
  width: 84%;
  height: 84%;
  background: transparent;
  border: 4px solid rgba(15, 23, 42, 0.35);
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
  transform: translate(var(--tx, -50%), -115%);
  max-width: 190px;
  padding: 7px 10px;
  border-radius: 12px;
  font-size: 0.82rem;
  line-height: 1.25;
  color: #0f172a;
  background: #fef9c3;
  box-shadow: 0 4px 14px rgba(2, 6, 23, 0.4);
  z-index: 5;
  pointer-events: none;
  animation: pop 0.18s ease-out;
}
.bubble.theirs {
  background: #fecaca;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translate(var(--tx, -50%), -95%) scale(0.9);
  }
}

.talk {
  max-height: 60vh;
  overflow-y: auto;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.35);
  padding: 6px;
}
.talk-line {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 0.9rem;
}
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
