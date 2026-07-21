<script setup lang="ts">
/**
 * 2048 — slide tiles with arrows / WASD / swipe / d-pad; equal tiles merge.
 * Reach 2048 to win, then keep going for a high score. One-level undo and a
 * best score persisted in localStorage. Movement animates by transitioning each
 * tile's position; merges and spawns pop. Core logic lives in services/game2048.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { useSquareFit } from '@/composables/useSquareFit'
import { SIZE, canMove, hasWon, move, spawn, type Direction, type Tile } from '@/services/game2048'

const { el: boardEl, px: boardPx } = useSquareFit(150)

const GAP = 10 // px between cells (scaled implicitly by the fitted board size)
const BEST_KEY = '2048-best'

const tiles = ref<Tile[]>([])
const consumed = ref<Tile[]>([]) // merged-away tiles kept one frame so they can slide in
const score = ref(0)
const best = ref(0)
const won = ref(false)
const keepPlaying = ref(false)
const over = ref(false)

let nextId = 1
let undo: { tiles: Tile[]; score: number } | null = null
const canUndo = ref(false)
let cleanupTimer: ReturnType<typeof setTimeout> | null = null
let busy = false // ignore input mid-animation so rapid keys can't desync the board

// Cell geometry derived from the fitted board so tiles line up with the grid.
const cellSize = computed(() => (boardPx.value - GAP * (SIZE + 1)) / SIZE)
const offset = (i: number) => GAP + i * (cellSize.value + GAP)

const renderTiles = computed(() => [...consumed.value, ...tiles.value])

const tileStyle = (t: Tile) => ({
  width: `${cellSize.value}px`,
  height: `${cellSize.value}px`,
  transform: `translate(${offset(t.col)}px, ${offset(t.row)}px)`,
})

// Larger numbers get smaller text so they still fit the tile.
const tileFontSize = (value: number) => {
  const digits = String(value).length
  const scale = digits >= 4 ? 0.34 : digits === 3 ? 0.42 : 0.5
  return `${Math.max(14, cellSize.value * scale)}px`
}

const persistBest = () => {
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }
}

const newGame = () => {
  if (cleanupTimer) clearTimeout(cleanupTimer)
  tiles.value = []
  consumed.value = []
  score.value = 0
  won.value = false
  keepPlaying.value = false
  over.value = false
  undo = null
  canUndo.value = false
  busy = false
  addRandomTile()
  addRandomTile()
}

const addRandomTile = () => {
  const t = spawn(tiles.value, Math.random, (nextId += 1))
  if (t) tiles.value = [...tiles.value, t]
}

const doMove = (dir: Direction) => {
  if (busy || over.value) return
  const before = tiles.value
  const result = move(before, dir)
  if (!result.moved) return

  // Snapshot for undo (deep copy so later mutations don't leak in).
  undo = { tiles: before.map((t) => ({ ...t, isNew: false, merged: false })), score: score.value }
  canUndo.value = true

  score.value += result.gained
  consumed.value = result.consumed
  tiles.value = result.tiles
  busy = true

  // After the slide settles, drop consumed tiles, then spawn the new one.
  cleanupTimer = setTimeout(() => {
    consumed.value = []
    tiles.value = tiles.value.map((t) => ({ ...t, merged: false }))
    addRandomTile()
    if (!won.value && hasWon(tiles.value)) won.value = true
    if (!canMove(tiles.value)) {
      over.value = true
      persistBest()
    }
    busy = false
  }, 110)
}

const undoMove = () => {
  if (!undo || busy) return
  if (cleanupTimer) clearTimeout(cleanupTimer)
  tiles.value = undo.tiles
  score.value = undo.score
  consumed.value = []
  over.value = false
  undo = null
  canUndo.value = false
  busy = false
}

const continueAfterWin = () => {
  keepPlaying.value = true
}

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
}

const onKey = (e: KeyboardEvent) => {
  const dir = KEY_DIRS[e.key]
  if (dir) {
    e.preventDefault()
    doMove(dir)
  }
}

// Swipe support
let touchStart: { x: number; y: number } | null = null
const onTouchStart = (e: TouchEvent) => {
  const t = e.changedTouches[0]
  touchStart = { x: t.clientX, y: t.clientY }
}
const onTouchEnd = (e: TouchEvent) => {
  if (!touchStart) return
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStart.x
  const dy = t.clientY - touchStart.y
  touchStart = null
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return
  if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left')
  else doMove(dy > 0 ? 'down' : 'up')
}

const snackbar = ref(false)
const share = async () => {
  const url = window.location.origin + '/2048'
  await copyToClipboard(`I scored ${score.value} in 2048${score.value === best.value && score.value > 0 ? ' (my best!)' : ''}. Beat me!\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  newGame()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  if (cleanupTimer) clearTimeout(cleanupTimer)
  window.removeEventListener('keydown', onKey)
})

const showWinOverlay = computed(() => won.value && !keepPlaying.value && !over.value)
</script>

<template>
  <v-container class="py-6" max-width="620">
    <GameToolbar title="2048" shareable @share="share">
      <template #intro>
        Arrow keys / WASD, the d-pad, or swipe. Slide the tiles — equal numbers merge. Reach
        <strong>2048</strong> to win, then keep going for a high score.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Combine tiles until one reads 2048. You can keep playing afterward to push your score higher.</p>
        <h3>Controls</h3>
        <ul>
          <li><span class="k">Arrow keys</span> or <span class="k">WASD</span> on desktop.</li>
          <li>The on-screen <span class="k">d-pad</span> or a <span class="k">swipe</span> on mobile.</li>
        </ul>
        <h3>Rules</h3>
        <ul>
          <li>Every move slides all tiles as far as they'll go in that direction.</li>
          <li>Two tiles of the same number merge into one worth their sum — but each tile merges at most once per move.</li>
          <li>A new 2 or 4 appears after every move. It's game over when no move is possible.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Keep your biggest tile pinned in a corner and build a descending row toward it.</li>
          <li>Pick one direction you never press unless forced — it keeps your board tidy.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- Scoreboard -->
    <div class="d-flex align-center ga-3 mb-3">
      <div class="score-box">
        <div class="score-label">Score</div>
        <div class="score-value">{{ score }}</div>
      </div>
      <div class="score-box">
        <div class="score-label">Best</div>
        <div class="score-value">{{ best }}</div>
      </div>
      <v-spacer />
      <v-btn variant="text" :disabled="!canUndo" prepend-icon="mdi-undo" @click="undoMove">Undo</v-btn>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-restart" @click="newGame">New</v-btn>
    </div>

    <!-- Board -->
    <div
      ref="boardEl"
      class="board"
      :style="{ width: boardPx + 'px', height: boardPx + 'px', padding: GAP + 'px', gap: GAP + 'px', gridTemplateColumns: `repeat(${SIZE}, 1fr)` }"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    >
      <!-- Background cells -->
      <div v-for="i in SIZE * SIZE" :key="i" class="cell" />

      <!-- Tiles (absolutely positioned, transitioned) -->
      <div
        v-for="t in renderTiles"
        :key="t.id"
        class="tile"
        :class="[`tile--${t.value <= 2048 ? t.value : 'super'}`, { 'tile--new': t.isNew, 'tile--merged': t.merged }]"
        :style="[tileStyle(t), { fontSize: tileFontSize(t.value) }]"
      >
        {{ t.value }}
      </div>

      <!-- Overlays -->
      <div v-if="showWinOverlay" class="overlay">
        <p class="text-h4 mb-1">You win! 🎉</p>
        <p class="text-body-1 mb-4">Reached 2048 with a score of {{ score }}.</p>
        <div class="d-flex ga-2">
          <v-btn color="primary" variant="flat" @click="continueAfterWin">Keep going</v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-restart" @click="newGame">New game</v-btn>
        </div>
      </div>
      <div v-else-if="over" class="overlay">
        <p class="text-h4 mb-1">Game over</p>
        <p class="text-body-1 mb-4">
          Score {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
        </p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="newGame">Play again</v-btn>
      </div>
    </div>

    <!-- On-screen d-pad -->
    <div class="dpad mt-5">
      <v-btn icon="mdi-chevron-up" variant="tonal" class="dpad--up" @click="doMove('up')" />
      <v-btn icon="mdi-chevron-left" variant="tonal" class="dpad--left" @click="doMove('left')" />
      <v-btn icon="mdi-chevron-right" variant="tonal" class="dpad--right" @click="doMove('right')" />
      <v-btn icon="mdi-chevron-down" variant="tonal" class="dpad--down" @click="doMove('down')" />
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Score copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
.board {
  position: relative;
  display: grid;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.15);
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.18), inset 0 0 40px rgba(124, 58, 237, 0.06);
  touch-action: none;
  user-select: none;
}

.cell {
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.06);
}

.tile {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-weight: 800;
  color: #f8fafc;
  /* Transition position only; the pop is a separate keyframe so it never fights the slide. */
  transition: transform 105ms ease-in-out;
  will-change: transform;
}

.tile--new {
  animation: pop-in 130ms ease-out;
}
.tile--merged {
  animation: pop-merge 130ms ease-out;
}

@keyframes pop-in {
  0% { opacity: 0; }
  60% { opacity: 1; }
}
@keyframes pop-merge {
  0% { transform: var(--merge-from, none); }
  50% { scale: 1.12; }
  100% { scale: 1; }
}

/* Tile palette — climbs from cool to warm as values grow. */
.tile--2 { background: #334155; }
.tile--4 { background: #3f4b63; }
.tile--8 { background: #2563eb; }
.tile--16 { background: #4f46e5; }
.tile--32 { background: #7c3aed; }
.tile--64 { background: #9333ea; }
.tile--128 { background: #c026d3; }
.tile--256 { background: #db2777; }
.tile--512 { background: #e11d48; }
.tile--1024 { background: #f97316; }
.tile--2048 { background: #facc15; color: #2b1a00; box-shadow: 0 0 24px rgba(250, 204, 21, 0.65); }
.tile--super { background: #34d399; color: #032311; box-shadow: 0 0 24px rgba(52, 211, 153, 0.6); }

.score-box {
  background: rgba(30, 41, 59, 0.75);
  border-radius: 8px;
  padding: 4px 16px;
  min-width: 84px;
  text-align: center;
}
.score-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.9);
}
.score-value {
  font-size: 1.4rem;
  font-weight: 800;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(3px);
  border-radius: 12px;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 48px);
  grid-template-rows: repeat(2, 48px);
  gap: 6px;
  justify-content: center;
}
.dpad--up { grid-area: 1 / 2; }
.dpad--left { grid-area: 2 / 1; }
.dpad--down { grid-area: 2 / 2; }
.dpad--right { grid-area: 2 / 3; }
</style>
