<script setup lang="ts">
/**
 * Tetris — the falling-blocks classic. Arrows / WASD to move & soft-drop, up (or
 * X) to rotate, Z for counter-clockwise, Space to hard-drop, C to hold, P to
 * pause; on-screen buttons and swipe mirror these on mobile. Ghost piece, 7-bag
 * randomizer, hold slot, next queue, level speed-up, and a saved best score.
 * Core rules live in services/tetris.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { useSquareFit } from '@/composables/useSquareFit'
import {
  COLS,
  COLOR_ORDER,
  ROWS,
  clearLines,
  collides,
  createBag,
  dropRow,
  emptyBoard,
  gravityMs,
  lineScore,
  matrixFor,
  merge,
  pieceCells,
  rotate,
  spawnPiece,
  type Board,
  type Piece,
  type PieceType,
} from '@/services/tetris'

const { el: boardEl, px: boardPx } = useSquareFit(160)
// The board is twice as tall as wide; fit it inside the measured square.
const cell = computed(() => boardPx.value / ROWS)
const boardWidth = computed(() => cell.value * COLS)

const BEST_KEY = 'tetris-best'
const rng = Math.random

const board = ref<Board>(emptyBoard())
const current = ref<Piece | null>(null)
const queue = ref<PieceType[]>([])
const holdType = ref<PieceType | null>(null)
const canHold = ref(true)
const score = ref(0)
const lines = ref(0)
const level = ref(1)
const best = ref(0)
const state = ref<'idle' | 'running' | 'paused' | 'over'>('idle')

let timer: ReturnType<typeof setInterval> | null = null

// Lock delay: a grounded piece doesn't lock instantly — it gets a short grace
// window so it can be slid or rotated into a gap. Moves reset the window a
// capped number of times so it can't be stalled forever.
const LOCK_DELAY = 500
const MAX_LOCK_RESETS = 15
let lockTimer: ReturnType<typeof setTimeout> | null = null
let lockResets = 0

const colorOf = (type: PieceType) => COLOR_ORDER.indexOf(type) + 1

const grounded = (): boolean =>
  !!current.value && collides(board.value, { ...current.value, y: current.value.y + 1 })

const clearLock = () => {
  if (lockTimer) clearTimeout(lockTimer)
  lockTimer = null
  lockResets = 0
}

const scheduleLock = () => {
  if (lockTimer) return
  lockTimer = setTimeout(() => {
    lockTimer = null
    lockResets = 0
    if (grounded()) lockPiece()
  }, LOCK_DELAY)
}

// Called after a manual move/rotate: cancel the lock if the piece can now fall,
// otherwise extend the grace window (up to the reset cap).
const bumpLock = () => {
  if (!lockTimer) return
  if (!grounded()) {
    clearLock()
  } else if (lockResets < MAX_LOCK_RESETS) {
    lockResets += 1
    clearTimeout(lockTimer)
    lockTimer = null
    scheduleLock()
  }
}

// Rendered board = settled cells + ghost landing spot + the active piece.
const view = computed(() => {
  const cells = board.value.map((color) => ({ color, ghost: false }))
  const piece = current.value
  if (piece && (state.value === 'running' || state.value === 'paused')) {
    for (const { x, y } of pieceCells(dropRow(board.value, piece))) {
      if (y >= 0 && !cells[y * COLS + x].color) cells[y * COLS + x] = { color: 0, ghost: true }
    }
    const color = colorOf(piece.type)
    for (const { x, y } of pieceCells(piece)) {
      if (y >= 0) cells[y * COLS + x] = { color, ghost: false }
    }
  }
  return cells
})

/** A 4×4 preview grid (color indices) for the hold/next slots. */
const previewCells = (type: PieceType | null): number[] => {
  const grid = Array<number>(16).fill(0)
  if (!type) return grid
  const m = matrixFor(type, 0)
  const color = colorOf(type)
  const offR = Math.floor((4 - m.length) / 2)
  const offC = Math.floor((4 - m[0].length) / 2)
  for (let r = 0; r < m.length; r += 1) {
    for (let c = 0; c < m[r].length; c += 1) {
      if (m[r][c]) grid[(r + offR) * 4 + (c + offC)] = color
    }
  }
  return grid
}

const nextPreviews = computed(() => queue.value.slice(0, 3))

const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}
const restartGravity = () => {
  stopTimer()
  if (state.value === 'running') timer = setInterval(tick, gravityMs(level.value))
}

const pullNext = (): PieceType => {
  if (queue.value.length <= 7) queue.value = [...queue.value, ...createBag(rng)]
  const [next, ...rest] = queue.value
  queue.value = rest
  return next
}

const spawnNext = () => {
  const piece = spawnPiece(pullNext())
  if (collides(board.value, piece)) {
    gameOver()
    return
  }
  current.value = piece
  canHold.value = true
}

const lockPiece = () => {
  if (!current.value) return
  clearLock()
  const { board: cleared, cleared: n } = clearLines(merge(board.value, current.value))
  board.value = cleared
  if (n > 0) {
    score.value += lineScore(n, level.value)
    lines.value += n
    const nextLevel = Math.floor(lines.value / 10) + 1
    if (nextLevel !== level.value) {
      level.value = nextLevel
      restartGravity() // faster gravity at the new level
    }
  }
  current.value = null
  spawnNext()
}

const tick = () => {
  if (state.value !== 'running' || !current.value) return
  const moved = { ...current.value, y: current.value.y + 1 }
  if (collides(board.value, moved)) scheduleLock()
  else current.value = moved
}

const tryMove = (dx: number) => {
  if (state.value !== 'running' || !current.value) return
  const moved = { ...current.value, x: current.value.x + dx }
  if (!collides(board.value, moved)) {
    current.value = moved
    bumpLock()
  }
}

const softDrop = () => {
  if (state.value !== 'running' || !current.value) return
  const moved = { ...current.value, y: current.value.y + 1 }
  if (collides(board.value, moved)) {
    scheduleLock()
  } else {
    current.value = moved
    score.value += 1
  }
}

const rotatePiece = (dir: 1 | -1) => {
  if (state.value !== 'running' || !current.value) return
  const rotated = rotate(board.value, current.value, dir)
  if (rotated) {
    current.value = rotated
    bumpLock()
  }
}

const hardDrop = () => {
  if (state.value !== 'running' || !current.value) return
  const landed = dropRow(board.value, current.value)
  score.value += (landed.y - current.value.y) * 2
  current.value = landed
  lockPiece()
}

const hold = () => {
  if (state.value !== 'running' || !current.value || !canHold.value) return
  const currentType = current.value.type
  if (holdType.value) {
    const piece = spawnPiece(holdType.value)
    holdType.value = currentType
    if (collides(board.value, piece)) {
      gameOver()
      return
    }
    current.value = piece
  } else {
    holdType.value = currentType
    current.value = null
    spawnNext()
  }
  canHold.value = false
}

const persistBest = () => {
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch {
      // ignore storage errors
    }
  }
}

const gameOver = () => {
  state.value = 'over'
  stopTimer()
  clearLock()
  current.value = null
  persistBest()
}

const reset = () => {
  stopTimer()
  clearLock()
  board.value = emptyBoard()
  queue.value = []
  holdType.value = null
  canHold.value = true
  score.value = 0
  lines.value = 0
  level.value = 1
  current.value = null
  state.value = 'idle'
}

const start = () => {
  if (state.value === 'idle' || state.value === 'over') {
    if (state.value === 'over') reset()
    state.value = 'running'
    spawnNext()
    restartGravity()
  } else if (state.value === 'paused') {
    state.value = 'running'
    restartGravity()
  }
}

const togglePause = () => {
  if (state.value === 'running') {
    state.value = 'paused'
    stopTimer()
    clearLock()
  } else if (state.value === 'paused') {
    start()
  }
}

const newGame = () => {
  reset()
  start()
}

// Actions that must fire once per physical press, not on OS key auto-repeat.
const NO_REPEAT = new Set([' ', 'ArrowUp', 'x', 'X', 'z', 'Z', 'c', 'C', 'p', 'P'])

const onKey = (e: KeyboardEvent) => {
  if (e.repeat && NO_REPEAT.has(e.key)) return
  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      e.preventDefault()
      tryMove(-1)
      break
    case 'ArrowRight':
    case 'd':
    case 'D':
      e.preventDefault()
      tryMove(1)
      break
    case 'ArrowDown':
    case 's':
    case 'S':
      e.preventDefault()
      softDrop()
      break
    case 'ArrowUp':
    case 'x':
    case 'X':
      e.preventDefault()
      rotatePiece(1)
      break
    case 'z':
    case 'Z':
      e.preventDefault()
      rotatePiece(-1)
      break
    case ' ':
      e.preventDefault()
      if (state.value === 'running') hardDrop()
      else start()
      break
    case 'c':
    case 'C':
      e.preventDefault()
      hold()
      break
    case 'p':
    case 'P':
      e.preventDefault()
      togglePause()
      break
  }
}

// Swipe: horizontal drag moves, a downward flick hard-drops, a tap rotates.
let touchStart: { x: number; y: number; t: number } | null = null
const onTouchStart = (e: TouchEvent) => {
  const t = e.changedTouches[0]
  touchStart = { x: t.clientX, y: t.clientY, t: e.timeStamp }
}
const onTouchEnd = (e: TouchEvent) => {
  if (!touchStart) return
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStart.x
  const dy = t.clientY - touchStart.y
  const start0 = touchStart
  touchStart = null
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && e.timeStamp - start0.t < 250) {
    rotatePiece(1)
    return
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    const steps = Math.round(dx / Math.max(cell.value, 1))
    for (let i = 0; i < Math.abs(steps); i += 1) tryMove(Math.sign(steps))
  } else if (dy > 24) {
    hardDrop()
  }
}

const snackbar = ref(false)
const share = async () => {
  const url = window.location.origin + '/tetris'
  await copyToClipboard(`I scored ${score.value} in Tetris (level ${level.value}, ${lines.value} lines). Beat me!\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    best.value = 0
  }
  reset()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  stopTimer()
  clearLock()
  persistBest()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <v-container class="py-6" max-width="720">
    <GameToolbar title="Tetris" shareable @share="share">
      <template #intro>
        Move with arrows / WASD, rotate with up (Z for the other way), hard-drop with Space, hold
        with C. On mobile, use the buttons or swipe. Clear lines to score; it speeds up each level.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Stack the falling tetrominoes to complete horizontal lines, which then clear. Clear four at once — a "tetris" — for the most points.</p>
        <h3>Controls</h3>
        <ul>
          <li><span class="k">←</span>/<span class="k">→</span> or <span class="k">A</span>/<span class="k">D</span> — move.</li>
          <li><span class="k">↓</span>/<span class="k">S</span> — soft drop. <span class="k">Space</span> — hard drop.</li>
          <li><span class="k">↑</span>/<span class="k">X</span> — rotate; <span class="k">Z</span> — rotate the other way.</li>
          <li><span class="k">C</span> — hold a piece for later. <span class="k">P</span> — pause.</li>
          <li>Mobile: on-screen buttons, or swipe to move / flick down to drop / tap to rotate.</li>
        </ul>
        <h3>Scoring</h3>
        <p>1/2/3/4 lines score 100/300/500/800 × level. Soft drop +1 per row, hard drop +2. You level up every 10 lines.</p>
        <h3>Tips</h3>
        <ul>
          <li>Keep the stack low and flat; leave one column open for I-pieces to score tetrises.</li>
          <li>Use hold to stash an awkward piece until it fits.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- Stats -->
    <div class="d-flex align-center ga-3 mb-3 flex-wrap">
      <div class="stat"><span class="stat-label">Score</span><span class="stat-value">{{ score }}</span></div>
      <div class="stat"><span class="stat-label">Lines</span><span class="stat-value">{{ lines }}</span></div>
      <div class="stat"><span class="stat-label">Level</span><span class="stat-value">{{ level }}</span></div>
      <v-spacer />
      <div class="text-body-2 text-medium-emphasis">Best: {{ best }}</div>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-restart" @click="newGame">New</v-btn>
    </div>

    <div class="play-area">
      <!-- Board -->
      <div ref="boardEl" class="board-wrap" :style="{ width: boardWidth + 'px', height: boardPx + 'px' }">
        <div
          class="board"
          :style="{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }"
          @touchstart.passive="onTouchStart"
          @touchend="onTouchEnd"
        >
          <div
            v-for="(c, i) in view"
            :key="i"
            class="cell"
            :class="[c.color ? `cell--${c.color}` : '', { 'cell--ghost': c.ghost }]"
          />
        </div>

        <div v-if="state !== 'running'" class="overlay">
          <template v-if="state === 'idle'">
            <p class="text-h6 mb-3">Ready?</p>
            <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
          </template>
          <template v-else-if="state === 'paused'">
            <p class="text-h6 mb-3">Paused</p>
            <v-btn color="primary" variant="flat" @click="togglePause">Resume</v-btn>
          </template>
          <template v-else>
            <p class="text-h5 mb-1">Game over</p>
            <p class="text-body-2 mb-3">
              Score {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
            </p>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="newGame">Play again</v-btn>
          </template>
        </div>
      </div>

      <!-- Side panel: hold + next -->
      <div class="side">
        <div class="side-label">Hold</div>
        <div class="mini">
          <div
            v-for="(c, i) in previewCells(holdType)"
            :key="'h' + i"
            class="mini-cell"
            :class="c ? `cell--${c}` : ''"
          />
        </div>
        <div class="side-label mt-3">Next</div>
        <div v-for="(t, n) in nextPreviews" :key="'n' + n" class="mini">
          <div
            v-for="(c, i) in previewCells(t)"
            :key="i"
            class="mini-cell"
            :class="c ? `cell--${c}` : ''"
          />
        </div>
      </div>
    </div>

    <!-- On-screen controls -->
    <div class="controls mt-4">
      <v-btn icon="mdi-rotate-right-variant" variant="tonal" @click="rotatePiece(1)" />
      <v-btn icon="mdi-chevron-left" variant="tonal" @click="tryMove(-1)" />
      <v-btn icon="mdi-chevron-down" variant="tonal" @click="softDrop" />
      <v-btn icon="mdi-chevron-right" variant="tonal" @click="tryMove(1)" />
      <v-btn icon="mdi-arrow-collapse-down" variant="tonal" @click="hardDrop" />
      <v-btn icon="mdi-tray-arrow-up" variant="tonal" :disabled="!canHold" @click="hold" />
      <v-btn :icon="state === 'paused' ? 'mdi-play' : 'mdi-pause'" variant="tonal" @click="togglePause" />
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Score copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
.play-area {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: center;
}

.board-wrap {
  position: relative;
  flex: 0 0 auto;
}

.board {
  display: grid;
  gap: 1px;
  padding: 4px;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.15);
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.18), inset 0 0 40px rgba(124, 58, 237, 0.06);
  touch-action: none;
  user-select: none;
}

.cell {
  border-radius: 2px;
  background: rgba(148, 163, 184, 0.05);
}
.cell--ghost {
  background: rgba(226, 232, 240, 0.16);
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.25);
}

/* Piece colors, in COLOR_ORDER: I O T S Z J L */
.cell--1 { background: #22d3ee; } /* I - cyan */
.cell--2 { background: #facc15; } /* O - yellow */
.cell--3 { background: #a855f7; } /* T - purple */
.cell--4 { background: #22c55e; } /* S - green */
.cell--5 { background: #ef4444; } /* Z - red */
.cell--6 { background: #3b82f6; } /* J - blue */
.cell--7 { background: #f97316; } /* L - orange */

.side {
  flex: 0 0 auto;
  min-width: 76px;
}
.side-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.9);
  margin-bottom: 4px;
}
.mini {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  width: 68px;
  aspect-ratio: 1;
  margin-bottom: 6px;
}
.mini-cell {
  border-radius: 2px;
  background: rgba(148, 163, 184, 0.05);
}

.stat {
  display: flex;
  flex-direction: column;
  background: rgba(30, 41, 59, 0.75);
  border-radius: 8px;
  padding: 4px 14px;
  min-width: 72px;
}
.stat-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.9);
}
.stat-value {
  font-size: 1.3rem;
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
  border-radius: 10px;
}

.controls {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
