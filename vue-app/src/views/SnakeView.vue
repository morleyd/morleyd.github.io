<script setup lang="ts">
/**
 * Snake — a prototype. Grid board with keyboard (arrows/WASD), on-screen d-pad,
 * and swipe controls. Eat food to grow and score; game over on wall/self hit.
 * High score persists in localStorage.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'

interface Cell {
  x: number
  y: number
}

const SPEEDS: Record<string, number> = { Slow: 160, Normal: 110, Fast: 75 }

const size = ref(17)
const speedLabel = ref<'Slow' | 'Normal' | 'Fast'>('Normal')

const snake = ref<Cell[]>([])
const dir = ref<Cell>({ x: 1, y: 0 })
const pendingDir = ref<Cell>({ x: 1, y: 0 })
const food = ref<Cell>({ x: 0, y: 0 })
const score = ref(0)
const best = ref(0)
const state = ref<'idle' | 'running' | 'over'>('idle')

let timer: ReturnType<typeof setInterval> | null = null

const key = (x: number, y: number) => y * size.value + x
const foodKey = computed(() => key(food.value.x, food.value.y))
const snakeMap = computed(() => {
  const m = new Map<number, number>()
  snake.value.forEach((c, i) => m.set(key(c.x, c.y), i))
  return m
})

const cellClass = (idx: number): string => {
  if (idx === foodKey.value) return 'cell--food'
  const seg = snakeMap.value.get(idx)
  if (seg === 0) return 'cell--head'
  if (seg !== undefined) return 'cell--body'
  return ''
}

const placeFood = (snk: Cell[] = snake.value) => {
  const occupied = new Set(snk.map((c) => key(c.x, c.y)))
  const free: number[] = []
  for (let i = 0; i < size.value * size.value; i += 1) {
    if (!occupied.has(i)) free.push(i)
  }
  const spot = free[Math.floor(Math.random() * free.length)] ?? 0
  food.value = { x: spot % size.value, y: Math.floor(spot / size.value) }
}

const reset = () => {
  const c = Math.floor(size.value / 2)
  snake.value = [
    { x: c, y: c },
    { x: c - 1, y: c },
    { x: c - 2, y: c },
  ]
  dir.value = { x: 1, y: 0 }
  pendingDir.value = { x: 1, y: 0 }
  score.value = 0
  placeFood()
  state.value = 'idle'
}

const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}

const runTimer = () => {
  stopTimer()
  timer = setInterval(step, SPEEDS[speedLabel.value])
}

const gameOver = () => {
  state.value = 'over'
  stopTimer()
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem('snake-best', String(best.value))
    } catch {
      // ignore
    }
  }
}

function step() {
  // Apply the pending turn unless it reverses direction
  if (!(pendingDir.value.x === -dir.value.x && pendingDir.value.y === -dir.value.y)) {
    dir.value = pendingDir.value
  }
  const head = snake.value[0]
  const nx = head.x + dir.value.x
  const ny = head.y + dir.value.y

  const willEat = nx === food.value.x && ny === food.value.y
  const body = willEat ? snake.value : snake.value.slice(0, -1)
  if (nx < 0 || ny < 0 || nx >= size.value || ny >= size.value || body.some((c) => c.x === nx && c.y === ny)) {
    gameOver()
    return
  }

  const next = [{ x: nx, y: ny }, ...snake.value]
  if (willEat) {
    score.value += 1
    placeFood(next)
  } else {
    next.pop()
  }
  snake.value = next
}

const start = () => {
  if (state.value === 'over') reset()
  state.value = 'running'
  runTimer()
}

const setDir = (x: number, y: number) => {
  if (state.value === 'over') return
  // ignore direct reversals relative to the current heading
  if (x === -dir.value.x && y === -dir.value.y) return
  pendingDir.value = { x, y }
  if (state.value === 'idle') start()
}

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
}

const onKey = (e: KeyboardEvent) => {
  const d = KEY_DIRS[e.key]
  if (d) {
    e.preventDefault()
    setDir(d[0], d[1])
  } else if (e.key === ' ') {
    e.preventDefault()
    if (state.value === 'running') {
      state.value = 'idle'
      stopTimer()
    } else {
      start()
    }
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
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return
  if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0)
  else setDir(0, dy > 0 ? 1 : -1)
  touchStart = null
}

const changeSize = (v: number) => {
  size.value = v
  reset()
}
const changeSpeed = (v: 'Slow' | 'Normal' | 'Fast') => {
  speedLabel.value = v
  if (state.value === 'running') runTimer()
}

const snackbar = ref(false)
const share = async () => {
  const url = window.location.origin + '/snake'
  await copyToClipboard(`I scored ${score.value} in Snake${score.value === best.value && score.value > 0 ? ' (my best!)' : ''}. Beat me!\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem('snake-best')) || 0
  } catch {
    best.value = 0
  }
  reset()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <v-container class="py-6" max-width="620">
    <GameToolbar title="Snake" shareable @share="share">
      <template #intro>
        Arrow keys / WASD, the d-pad, or swipe. Eat the food to grow — don't hit the walls or
        yourself.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Guide the snake to eat food and grow as long as possible without crashing.</p>
        <h3>Controls</h3>
        <ul>
          <li><span class="k">Arrow keys</span> or <span class="k">WASD</span> on desktop.</li>
          <li>The on-screen <span class="k">d-pad</span> or a <span class="k">swipe</span> on mobile.</li>
          <li><span class="k">Space</span> pauses.</li>
        </ul>
        <h3>Rules</h3>
        <ul>
          <li>Each food eaten grows the snake by one and adds a point.</li>
          <li>You lose if you hit a wall or your own body. You can't reverse directly into yourself.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>Use the edges to stall safely while you plan a route to the food.</li>
          <li>Leave yourself an exit — don't coil into a dead end.</li>
        </ul>
      </template>
      <template #settings>
        <div class="d-flex align-center flex-wrap ga-6">
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Board: {{ size }}×{{ size }}</label>
            <v-slider
              :model-value="size"
              :min="10"
              :max="24"
              :step="1"
              hide-details
              density="compact"
              @update:model-value="changeSize"
            />
          </div>
          <v-btn-toggle
            :model-value="speedLabel"
            mandatory
            density="compact"
            variant="outlined"
            divided
            @update:model-value="changeSpeed"
          >
            <v-btn v-for="s in ['Slow', 'Normal', 'Fast']" :key="s" :value="s" size="small">{{ s }}</v-btn>
          </v-btn-toggle>
        </div>
      </template>
    </GameToolbar>

    <!-- Scoreboard -->
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-h6">
        Score: <span class="font-weight-bold">{{ score }}</span>
      </div>
      <div class="text-body-2 text-medium-emphasis">Best: {{ best }}</div>
    </div>

    <!-- Board -->
    <div class="board-wrap game-board" style="--board-fit: calc(100dvh - 330px)">
      <div
        class="board"
        :style="{ gridTemplateColumns: `repeat(${size}, 1fr)` }"
        @touchstart.passive="onTouchStart"
        @touchend="onTouchEnd"
      >
        <div v-for="i in size * size" :key="i" class="cell" :class="cellClass(i - 1)"></div>
      </div>

      <!-- Overlays -->
      <div v-if="state !== 'running'" class="overlay">
        <template v-if="state === 'idle'">
          <p class="text-h6 mb-3">Ready?</p>
          <v-btn color="primary" variant="flat" @click="start">Start</v-btn>
        </template>
        <template v-else>
          <p class="text-h5 mb-1">Game over</p>
          <p class="text-body-1 mb-3">
            Score {{ score }}<span v-if="score === best && score > 0"> — new best!</span>
          </p>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-restart" @click="start">Play again</v-btn>
        </template>
      </div>
    </div>

    <!-- On-screen d-pad -->
    <div class="dpad mt-5">
      <v-btn icon="mdi-chevron-up" variant="tonal" class="dpad--up" @click="setDir(0, -1)" />
      <v-btn icon="mdi-chevron-left" variant="tonal" class="dpad--left" @click="setDir(-1, 0)" />
      <v-btn icon="mdi-chevron-right" variant="tonal" class="dpad--right" @click="setDir(1, 0)" />
      <v-btn icon="mdi-chevron-down" variant="tonal" class="dpad--down" @click="setDir(0, 1)" />
    </div>
    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Score copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
.slider-wrap {
  min-width: 200px;
  flex: 1 1 200px;
}

.board-wrap {
  position: relative;
}

.board {
  display: grid;
  gap: 2px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.15);
  aspect-ratio: 1 / 1;
  touch-action: none;
  /* subtle ambient glow */
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.18), inset 0 0 40px rgba(124, 58, 237, 0.06);
}

.cell {
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.06);
}
.cell--body {
  background: #7c3aed;
}
.cell--head {
  background: #c084fc;
  box-shadow: 0 0 8px rgba(192, 132, 252, 0.7);
}
.cell--food {
  background: #34d399;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.7);
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(3px);
  border-radius: 12px;
}

/* Compact 3-column d-pad */
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
