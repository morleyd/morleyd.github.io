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
  fullRows,
  gravityMs,
  lineScore,
  matrixFor,
  merge,
  pieceCells,
  rotate,
  spawnPiece,
  stepDown,
  SOFT_DROP_REPEAT_MS,
  type Board,
  type Piece,
  type PieceType,
} from '@/services/tetris'

// Trim the reserved bottom space so the board fills most of the viewport height.
const { el: boardEl, px: boardPx } = useSquareFit(92)
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

// Line-clear animation: full rows flash briefly before they collapse away. This
// is purely a view concern — the pure clear happens in clearLines once the flash
// finishes. `clearingRows` holds the rows currently flashing.
const CLEAR_ANIM_MS = 320
const clearingRows = ref<number[]>([])
let clearTimer: ReturnType<typeof setTimeout> | null = null
const cancelClear = () => {
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = null
  clearingRows.value = []
}

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
  const flashing = new Set(clearingRows.value)
  const cells = board.value.map((color, i) => ({
    color,
    ghost: false,
    clearing: flashing.has(Math.floor(i / COLS)),
  }))
  const piece = current.value
  if (piece && (state.value === 'running' || state.value === 'paused')) {
    for (const { x, y } of pieceCells(dropRow(board.value, piece))) {
      if (y >= 0 && !cells[y * COLS + x].color)
        cells[y * COLS + x] = { color: 0, ghost: true, clearing: false }
    }
    const color = colorOf(piece.type)
    for (const { x, y } of pieceCells(piece)) {
      if (y >= 0) cells[y * COLS + x] = { color, ghost: false, clearing: false }
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

// Progress within the current level: you advance a level every 10 lines.
const linesToNext = computed(() => 10 - (lines.value % 10))
const levelProgress = computed(() => (lines.value % 10) * 10)

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

// Settle the score/level for a clear of `n` rows.
const applyClear = (n: number) => {
  score.value += lineScore(n, level.value)
  lines.value += n
  const nextLevel = Math.floor(lines.value / 10) + 1
  if (nextLevel !== level.value) {
    level.value = nextLevel
    restartGravity() // faster gravity at the new level
  }
}

// Finish a pending line-clear right now: collapse the flashed rows and spawn the
// next piece. During the flash board.value holds the merged (pre-clear) board, so
// clearLines(board.value) is the settled board. Safe to call with no clear pending.
const finishClear = () => {
  if (!clearTimer) return
  clearTimeout(clearTimer)
  clearTimer = null
  clearingRows.value = []
  board.value = clearLines(board.value).board
  spawnNext()
}

const lockPiece = () => {
  if (!current.value) return
  clearLock()
  const merged = merge(board.value, current.value)
  current.value = null
  const full = fullRows(merged)
  if (full.length === 0) {
    board.value = merged
    spawnNext()
    return
  }
  // Show the completed rows, flash them, then collapse. Gravity pauses during
  // the flash so nothing spawns on top of the animating board.
  board.value = merged
  clearingRows.value = full
  applyClear(full.length)
  stopTimer() // keep gravity paused through the flash, even after a level-up
  clearTimer = setTimeout(() => {
    finishClear()
    if (state.value === 'running') restartGravity()
  }, CLEAR_ANIM_MS)
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
  const moved = stepDown(board.value, current.value)
  if (!moved) {
    scheduleLock()
  } else {
    current.value = moved
    score.value += 1
  }
}

// Press-and-hold soft drop: the on-screen down button soft-drops once on press,
// then repeats on an interval until release. (Keyboard down-hold already repeats
// via OS key auto-repeat.)
let softDropTimer: ReturnType<typeof setInterval> | null = null
const stopSoftDropRepeat = () => {
  if (softDropTimer) clearInterval(softDropTimer)
  softDropTimer = null
}
const startSoftDropRepeat = () => {
  stopSoftDropRepeat()
  softDrop()
  softDropTimer = setInterval(softDrop, SOFT_DROP_REPEAT_MS)
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
  stopSoftDropRepeat()
  clearLock()
  cancelClear()
  current.value = null
  persistBest()
}

const reset = () => {
  stopTimer()
  clearLock()
  cancelClear()
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
    finishClear() // resolve an in-progress line clear before freezing
    if (state.value !== 'running') return // a topped-out spawn already ended the game
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

// Control tooltips: desktop hover only. Disabling open-on-click / open-on-focus
// stops them sticking on-screen after a tap on touch devices.
const tipProps = { openOnHover: true, openOnClick: false, openOnFocus: false } as const

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
  stopSoftDropRepeat()
  clearLock()
  cancelClear()
  persistBest()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <v-container class="py-4" max-width="720">
    <GameToolbar title="Tetris" shareable @share="share">
      <template #intro>
        Arrows / WASD to move, up to rotate, Space to hard-drop. Info button for the full guide.
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
        <h3>Scoring &amp; levels</h3>
        <p>1/2/3/4 lines score 100/300/500/800 × level. Soft drop +1 per row, hard drop +2.</p>
        <p>Every 10 lines you gain a level. Higher levels are a bonus, not just a challenge: pieces fall faster <em>and</em> every line clear is multiplied by your level, so the same tetris is worth far more later on. The bar under the stats shows your progress to the next level.</p>
        <h3>Tips</h3>
        <ul>
          <li>Keep the stack low and flat; leave one column open for I-pieces to score tetrises.</li>
          <li>Use hold to stash an awkward piece until it fits.</li>
        </ul>
      </template>
    </GameToolbar>

    <!-- Stats -->
    <div class="d-flex align-center ga-3 mb-2 flex-wrap">
      <div class="stat"><span class="stat-label">Score</span><span class="stat-value">{{ score }}</span></div>
      <div class="stat"><span class="stat-label">Lines</span><span class="stat-value">{{ lines }}</span></div>
      <div class="stat"><span class="stat-label">Level</span><span class="stat-value">{{ level }}</span></div>
      <v-spacer />
      <div class="text-body-2 text-medium-emphasis">Best: {{ best }}</div>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-restart" @click="newGame">New</v-btn>
    </div>

    <!-- Level progress: faster fall + higher line scores at the next level. -->
    <div class="level-progress mb-2">
      <v-progress-linear :model-value="levelProgress" color="primary" height="6" rounded />
      <span class="level-progress-label text-caption text-medium-emphasis">
        {{ linesToNext }} more {{ linesToNext === 1 ? 'line' : 'lines' }} to level {{ level + 1 }} (faster fall, bigger scores)
      </span>
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
            :class="[
              c.color ? `cell--${c.color}` : '',
              { 'cell--ghost': c.ghost, 'cell--clearing': c.clearing },
            ]"
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
            <div class="d-flex ga-2">
              <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="newGame">Play again</v-btn>
              <v-btn color="secondary" variant="tonal" prepend-icon="mdi-share-variant" @click="share">Share</v-btn>
            </div>
          </template>
        </div>
      </div>

      <!-- Side panel: hold + next. A compact strip above the board on narrow
           screens, a column beside it on wide ones — always visible. -->
      <div class="side">
        <div class="side-group">
          <div class="side-label">Hold</div>
          <div class="mini">
            <div
              v-for="(c, i) in previewCells(holdType)"
              :key="'h' + i"
              class="mini-cell"
              :class="c ? `cell--${c}` : ''"
            />
          </div>
        </div>
        <div class="side-group side-next">
          <div class="side-label">Next</div>
          <div class="mini-row">
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
      </div>
    </div>

    <!-- On-screen controls. Hard-drop stays on Space / a downward swipe to keep
         this row simple — one clear down control that soft-drops. -->
    <div class="controls mt-4">
      <v-btn icon variant="tonal" @click="rotatePiece(1)">
        <v-icon icon="mdi-rotate-right-variant" />
        <v-tooltip activator="parent" location="top" v-bind="tipProps" text="Rotate" />
      </v-btn>
      <v-btn icon variant="tonal" @click="tryMove(-1)">
        <v-icon icon="mdi-chevron-left" />
        <v-tooltip activator="parent" location="top" v-bind="tipProps" text="Move left" />
      </v-btn>
      <v-btn
        icon
        variant="tonal"
        @pointerdown.prevent="startSoftDropRepeat"
        @pointerup="stopSoftDropRepeat"
        @pointerleave="stopSoftDropRepeat"
        @pointercancel="stopSoftDropRepeat"
      >
        <v-icon icon="mdi-chevron-down" />
        <v-tooltip activator="parent" location="top" v-bind="tipProps" text="Soft drop — hold to drop faster (Space / swipe down to hard-drop)" />
      </v-btn>
      <v-btn icon variant="tonal" @click="tryMove(1)">
        <v-icon icon="mdi-chevron-right" />
        <v-tooltip activator="parent" location="top" v-bind="tipProps" text="Move right" />
      </v-btn>
      <v-btn icon variant="tonal" :disabled="!canHold" @click="hold">
        <v-icon icon="mdi-archive-arrow-down-outline" />
        <v-tooltip activator="parent" location="top" v-bind="tipProps" text="Hold piece" />
      </v-btn>
      <v-btn icon variant="tonal" @click="togglePause">
        <v-icon :icon="state === 'paused' ? 'mdi-play' : 'mdi-pause'" />
        <v-tooltip activator="parent" location="top" v-bind="tipProps" :text="state === 'paused' ? 'Resume' : 'Pause'" />
      </v-btn>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Score copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
/* Mobile-first: stack the hold/next strip above the board so it's never pushed
   off-screen. Wide screens move it beside the board (see the media query). */
.play-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
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
/* Completed rows flash bright, then the row collapses just before it clears. */
.cell--clearing {
  animation: line-clear 320ms ease-out forwards;
  z-index: 1;
}
@keyframes line-clear {
  0% {
    filter: brightness(1);
    transform: scale(1);
  }
  35% {
    background: #fff;
    filter: brightness(2.4);
    transform: scale(1.08);
  }
  100% {
    background: #fff;
    filter: brightness(3);
    transform: scaleY(0);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cell--clearing {
    animation-duration: 1ms;
  }
}

/* Piece colors, in COLOR_ORDER: I O T S Z J L */
.cell--1 { background: #22d3ee; } /* I - cyan */
.cell--2 { background: #facc15; } /* O - yellow */
.cell--3 { background: #a855f7; } /* T - purple */
.cell--4 { background: #22c55e; } /* S - green */
.cell--5 { background: #ef4444; } /* Z - red */
.cell--6 { background: #3b82f6; } /* J - blue */
.cell--7 { background: #f97316; } /* L - orange */

/* Narrow: a horizontal strip of Hold + Next groups above the board. */
.side {
  flex: 0 0 auto;
  order: -1;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16px;
}
.side-group {
  display: flex;
  flex-direction: column;
}
.side-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.9);
  margin-bottom: 4px;
}
.mini-row {
  display: flex;
  flex-direction: row;
  gap: 6px;
}
.mini {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  width: 56px;
  aspect-ratio: 1;
}
.mini-cell {
  border-radius: 2px;
  background: rgba(148, 163, 184, 0.05);
}

.level-progress {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Wide: hold/next sits in a column beside the board, next pieces stacked. */
@media (min-width: 640px) {
  .play-area {
    flex-direction: row;
    align-items: flex-start;
    gap: 14px;
  }
  .side {
    order: 0;
    flex-direction: column;
    justify-content: flex-start;
    gap: 18px;
    min-width: 96px;
  }
  .side-label {
    font-size: 0.8rem;
    margin-bottom: 6px;
  }
  .mini-row {
    flex-direction: column;
    gap: 8px;
  }
  .mini {
    width: 88px;
    padding: 6px;
    border-radius: 8px;
    background: rgba(2, 6, 23, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.15);
  }
}

.stat {
  display: flex;
  flex-direction: column;
  background: rgba(30, 41, 59, 0.75);
  border-radius: 8px;
  padding: 2px 12px;
  min-width: 68px;
}
.stat-label {
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.9);
}
.stat-value {
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.3;
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
