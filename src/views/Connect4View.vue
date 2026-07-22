<script setup lang="ts">
/**
 * Connect 4 vs AI — drop discs to get four in a row against a negamax bot with
 * three difficulty levels. You can choose who moves first. Winning discs are
 * highlighted. AI logic lives in services/connect4.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { useViewportFit } from '@/composables/useViewportFit'
import {
  AI,
  COLS,
  PLAYER,
  ROWS,
  bestMove,
  dropRow,
  emptyBoard,
  findWin,
  isFull,
  isWin,
  play,
  type Board,
  type Disc,
  type Level,
} from '@/services/connect4'

// The board is a 7×6 (wider-than-tall) rectangle, so a plain square fit would
// waste vertical space. Fit the largest COLS:ROWS box into the live viewport —
// filling most of the height on desktop while staying width-bound on mobile.
// RESERVE_BOTTOM covers the footer + padding below the board.
const RESERVE_BOTTOM = 84
const { el: boardEl, w } = useViewportFit(COLS / ROWS, RESERVE_BOTTOM)
// Square cells derived from the fitted width; the board is exactly COLS×ROWS cells.
const cell = computed(() => w.value / COLS)
const boardW = computed(() => Math.round(cell.value * COLS))
const boardH = computed(() => Math.round(cell.value * ROWS))

const LEVELS: Level[] = ['easy', 'medium', 'hard']

const level = ref<Level>('medium')
const firstMove = ref<'you' | 'ai'>('you')
const board = ref<Board>(emptyBoard())
const turn = ref<'player' | 'ai' | 'over'>('player')
const winner = ref<Disc | 'draw' | null>(null)
const winCells = ref<Set<number>>(new Set())
const hoverCol = ref(-1)

let aiTimer: ReturnType<typeof setTimeout> | null = null

const discAt = (r: number, c: number): Disc => board.value[r * COLS + c]
const columnFull = (c: number) => dropRow(board.value, c) === -1

const clearAiTimer = () => {
  if (aiTimer) clearTimeout(aiTimer)
  aiTimer = null
}

const finish = (result: Disc | 'draw') => {
  winner.value = result
  turn.value = 'over'
  if (result === PLAYER || result === AI) {
    winCells.value = new Set(findWin(board.value, result) ?? [])
  }
}

const applyMove = (col: number, who: Disc): boolean => {
  if (columnFull(col)) return false
  board.value = play(board.value, col, who)
  if (isWin(board.value, who)) {
    finish(who)
    return true
  }
  if (isFull(board.value)) {
    finish('draw')
    return true
  }
  return false
}

const aiMove = () => {
  clearAiTimer()
  aiTimer = setTimeout(() => {
    if (turn.value !== 'ai') return
    const col = bestMove(board.value, level.value, Math.random)
    const done = applyMove(col, AI)
    if (!done) turn.value = 'player'
  }, 420)
}

const drop = (col: number) => {
  if (turn.value !== 'player' || columnFull(col)) return
  const done = applyMove(col, PLAYER)
  if (!done) {
    turn.value = 'ai'
    aiMove()
  }
}

const newGame = () => {
  clearAiTimer()
  board.value = emptyBoard()
  winner.value = null
  winCells.value = new Set()
  hoverCol.value = -1
  if (firstMove.value === 'ai') {
    turn.value = 'ai'
    aiMove()
  } else {
    turn.value = 'player'
  }
}

const setLevel = (l: Level) => {
  level.value = l
  newGame()
}
const setFirst = (f: 'you' | 'ai') => {
  firstMove.value = f
  newGame()
}

const statusText = computed(() => {
  if (winner.value === PLAYER) return 'You win! 🎉'
  if (winner.value === AI) return 'The AI wins'
  if (winner.value === 'draw') return "It's a draw"
  return turn.value === 'ai' ? 'AI is thinking…' : 'Your move'
})

onMounted(() => {
  newGame()
})
onBeforeUnmount(() => {
  clearAiTimer()
})
</script>

<template>
  <v-container class="py-6" max-width="820">
    <GameToolbar title="Connect 4">
      <template #intro>
        Drop your discs and get four in a row — across, down, or diagonally — before the AI does.
        Pick a difficulty and who goes first.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">Difficulty</label>
            <v-btn-toggle :model-value="level" mandatory density="compact" variant="outlined" divided @update:model-value="setLevel">
              <v-btn v-for="l in LEVELS" :key="l" :value="l" size="small" class="text-capitalize">{{ l }}</v-btn>
            </v-btn-toggle>
          </div>
          <div>
            <label class="text-caption text-medium-emphasis d-block mb-1">First move</label>
            <v-btn-toggle :model-value="firstMove" mandatory density="compact" variant="outlined" divided @update:model-value="setFirst">
              <v-btn value="you" size="small">You</v-btn>
              <v-btn value="ai" size="small">AI</v-btn>
            </v-btn-toggle>
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Be the first to line up four of your discs in a row — horizontally, vertically, or diagonally.</p>
        <h3>How to play</h3>
        <ul>
          <li>Click or tap a column to drop your disc into the lowest open slot.</li>
          <li>You are <span class="chip chip--you">teal</span>; the AI is <span class="chip chip--ai">gold</span>.</li>
        </ul>
        <h3>Difficulty</h3>
        <p>The AI searches ahead with alpha-beta pruning — 2 moves on easy (with occasional random play), up to 6 on hard.</p>
      </template>
    </GameToolbar>

    <!-- Status -->
    <div class="d-flex align-center mb-3">
      <div class="text-h6 d-flex align-center ga-2">
        <span class="dot" :class="turn === 'ai' ? 'dot--ai' : 'dot--you'" />
        {{ statusText }}
      </div>
      <v-spacer />
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New</v-btn>
    </div>

    <!-- Board -->
    <div ref="boardEl" class="board-wrap" :style="{ width: boardW + 'px', height: boardH + 'px' }">
      <div class="board">
        <div
          v-for="c in COLS"
          :key="c"
          class="col"
          :class="{ 'col--full': columnFull(c - 1), 'col--hover': hoverCol === c - 1 && turn === 'player' }"
          @click="drop(c - 1)"
          @mouseenter="hoverCol = c - 1"
          @mouseleave="hoverCol = -1"
        >
          <div v-for="r in ROWS" :key="r" class="slot">
            <div
              class="disc"
              :class="{
                'disc--you': discAt(r - 1, c - 1) === PLAYER,
                'disc--ai': discAt(r - 1, c - 1) === AI,
                'disc--win': winCells.has((r - 1) * COLS + (c - 1)),
              }"
            />
          </div>
        </div>
      </div>

      <div v-if="turn === 'over'" class="overlay">
        <p class="text-h4 mb-3">{{ statusText }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">Play again</v-btn>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.board-wrap {
  position: relative;
  margin: 0 auto;
}
.board {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 0;
  padding: 6px;
  border-radius: 16px;
  background: linear-gradient(160deg, #7c3aed, #4c1d95);
  box-shadow: 0 0 48px rgba(124, 58, 237, 0.35), inset 0 2px 10px rgba(0, 0, 0, 0.35);
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.col--full {
  cursor: default;
}
.col--hover {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}
.slot {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.disc {
  width: 78%;
  height: 78%;
  border-radius: 50%;
  background: rgba(2, 6, 23, 0.5); /* empty hole */
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.55);
  transition: background 120ms ease;
}
.disc--you {
  background: radial-gradient(circle at 35% 30%, #5eead4, #14b8a6);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
}
.disc--ai {
  background: radial-gradient(circle at 35% 30%, #fde047, #f59e0b);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
}
.disc--win {
  outline: 3px solid #f8fafc;
  outline-offset: -3px;
  box-shadow: 0 0 16px 2px rgba(250, 204, 21, 0.9);
  animation: pulse 900ms ease-in-out infinite;
}
@keyframes pulse {
  50% {
    outline-color: rgba(248, 250, 252, 0.35);
    box-shadow: 0 0 8px 1px rgba(250, 204, 21, 0.45);
  }
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-block;
}
.dot--you { background: #2dd4bf; }
.dot--ai { background: #facc15; }

.chip {
  padding: 0 6px;
  border-radius: 4px;
  font-weight: 700;
  color: #1a1000;
}
.chip--you { background: #5eead4; }
.chip--ai { background: #fde047; }

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
</style>
