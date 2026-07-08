<script setup lang="ts">
/**
 * Minesweeper — clear every safe cell using the number clues. Boards are
 * generated from a seed (shareable). Tap to dig, right-click / flag-mode to flag.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed, rngFromSeed } from '@/services/seed'
import { useSquareFit } from '@/composables/useSquareFit'

const { el: boardEl, px: boardPx } = useSquareFit(160)

interface Cell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
}

const presets: Record<string, { size: number; mines: number }> = {
  Easy: { size: 9, mines: 10 },
  Medium: { size: 12, mines: 24 },
  Hard: { size: 16, mines: 50 },
}
const levelKey: Record<string, 'Easy' | 'Medium' | 'Hard'> = { E: 'Easy', M: 'Medium', H: 'Hard' }

const route = useRoute()
const router = useRouter()

const level = ref<'Easy' | 'Medium' | 'Hard'>('Easy')
const code = ref('')
const size = computed(() => presets[level.value].size)
const mineCount = computed(() => presets[level.value].mines)

const cells = ref<Cell[]>([])
const state = ref<'ready' | 'playing' | 'won' | 'lost'>('ready')
const flagMode = ref(false)
const elapsed = ref(0)
const best = reactive<Record<string, number>>({})
const snackbar = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const flagsUsed = computed(() => cells.value.filter((c) => c.flagged).length)
const minesLeft = computed(() => mineCount.value - flagsUsed.value)

const neighbors = (idx: number): number[] => {
  const n = size.value
  const x = idx % n
  const y = Math.floor(idx / n)
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < n && ny < n) out.push(ny * n + nx)
    }
  }
  return out
}

const stopTimer = () => {
  if (timer) clearInterval(timer)
  timer = null
}

const build = () => {
  stopTimer()
  const n = size.value
  const rng = rngFromSeed(`${level.value}|${code.value}`)
  cells.value = Array.from({ length: n * n }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    adjacent: 0,
  }))
  // seeded mine placement (whole board deterministic → shareable)
  const spots = Array.from({ length: n * n }, (_, i) => i)
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[spots[i], spots[j]] = [spots[j], spots[i]]
  }
  spots.slice(0, mineCount.value).forEach((i) => {
    cells.value[i].mine = true
  })
  cells.value.forEach((cell, i) => {
    if (!cell.mine) cell.adjacent = neighbors(i).filter((j) => cells.value[j].mine).length
  })
  state.value = 'ready'
  elapsed.value = 0
  flagMode.value = false
}

const syncUrl = () => {
  const lk = (Object.keys(levelKey).find((k) => levelKey[k] === level.value) || 'E')
  router.replace({ name: 'minesweeper', params: { seed: `${lk}.${code.value}` } })
}
const newGame = () => {
  code.value = randomSeed()
  syncUrl()
  build()
}
const changeLevel = (v: 'Easy' | 'Medium' | 'Hard') => {
  level.value = v
  newGame()
}

const floodReveal = (start: number) => {
  const stack = [start]
  while (stack.length) {
    const i = stack.pop() as number
    const cell = cells.value[i]
    if (cell.revealed || cell.flagged || cell.mine) continue
    cell.revealed = true
    if (cell.adjacent === 0) neighbors(i).forEach((j) => !cells.value[j].revealed && stack.push(j))
  }
}

const checkWin = () => {
  if (cells.value.filter((c) => c.revealed).length === size.value * size.value - mineCount.value) {
    state.value = 'won'
    stopTimer()
    const b = best[level.value]
    if (b === undefined || elapsed.value < b) {
      best[level.value] = elapsed.value
      try {
        localStorage.setItem('mine-best', JSON.stringify(best))
      } catch {
        // ignore
      }
    }
  }
}

const toggleFlag = (i: number) => {
  const cell = cells.value[i]
  if (cell.revealed || state.value === 'won' || state.value === 'lost') return
  cell.flagged = !cell.flagged
}

const onCell = (i: number) => {
  if (state.value === 'won' || state.value === 'lost') return
  const cell = cells.value[i]
  if (flagMode.value) return toggleFlag(i)
  if (cell.flagged) return
  if (state.value === 'ready') {
    state.value = 'playing'
    timer = setInterval(() => {
      elapsed.value += 1
    }, 1000)
  }
  if (cell.mine) {
    cells.value.forEach((c) => {
      if (c.mine) c.revealed = true
    })
    state.value = 'lost'
    stopTimer()
    return
  }
  floodReveal(i)
  checkWin()
}

const onContext = (i: number, e: Event) => {
  e.preventDefault()
  toggleFlag(i)
}

const numberColors = ['', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#fbbf24', '#22d3ee', '#e2e8f0', '#94a3b8']

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const bestLabel = computed(() => (best[level.value] === undefined ? '—' : fmtTime(best[level.value])))

const share = async () => {
  const url = window.location.origin + route.fullPath
  const line =
    state.value === 'won'
      ? `Cleared ${level.value} Minesweeper in ${fmtTime(elapsed.value)}. Beat my time!`
      : `Try this ${level.value} Minesweeper board:`
  await copyToClipboard(`${line}\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  try {
    Object.assign(best, JSON.parse(localStorage.getItem('mine-best') || '{}'))
  } catch {
    // ignore
  }
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  const m = /^([EMH])\.(.+)$/.exec(p)
  if (m) {
    level.value = levelKey[m[1]]
    code.value = m[2]
    build()
  } else {
    newGame()
  }
})
onBeforeUnmount(stopTimer)
</script>

<template>
  <v-container class="py-6" max-width="640">
    <GameToolbar title="Minesweeper" shareable @share="share">
      <template #intro>
        Dig every cell that isn't a mine. Number clues tell you how many mines touch that cell.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <v-btn-toggle :model-value="level" mandatory density="compact" variant="outlined" divided @update:model-value="changeLevel">
            <v-btn v-for="l in ['Easy', 'Medium', 'Hard']" :key="l" :value="l" size="small">{{ l }}</v-btn>
          </v-btn-toggle>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Reveal every safe cell without detonating a mine. Flag the mines to keep track.</p>
        <h3>Controls</h3>
        <ul>
          <li><span class="k">Tap</span> a cell to dig it.</li>
          <li><span class="k">Right-click</span>, or turn on <span class="k">Flag</span> mode, to place/remove a flag.</li>
        </ul>
        <h3>Reading the clues</h3>
        <ul>
          <li>A number is how many of the 8 neighboring cells are mines.</li>
          <li>Blank cells have zero neighboring mines and open up their neighbors automatically.</li>
        </ul>
        <h3>Tips</h3>
        <ul>
          <li>If a number already touches that many flags, its other neighbors are safe to dig.</li>
          <li>If a number equals its hidden neighbors, all of those are mines — flag them.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="d-flex align-center justify-space-between mb-3 ga-2">
      <v-chip variant="tonal" prepend-icon="mdi-mine">{{ minesLeft }}</v-chip>
      <v-btn :color="flagMode ? 'secondary' : undefined" :variant="flagMode ? 'flat' : 'tonal'" prepend-icon="mdi-flag" size="small" @click="flagMode = !flagMode">
        Flag{{ flagMode ? ' on' : '' }}
      </v-btn>
      <v-chip variant="tonal" prepend-icon="mdi-timer-outline">{{ fmtTime(elapsed) }}</v-chip>
    </div>

    <div ref="boardEl" class="board-wrap" :style="{ width: boardPx + 'px', height: boardPx + 'px' }">
      <div class="board" :style="{ gridTemplateColumns: `repeat(${size}, 1fr)` }">
        <button
          v-for="(cell, i) in cells"
          :key="i"
          type="button"
          class="cell"
          :class="{ 'cell--revealed': cell.revealed, 'cell--mine': cell.revealed && cell.mine }"
          @click="onCell(i)"
          @contextmenu="onContext(i, $event)"
        >
          <template v-if="cell.flagged && !cell.revealed">🚩</template>
          <template v-else-if="cell.revealed && cell.mine">💣</template>
          <template v-else-if="cell.revealed && cell.adjacent > 0">
            <span :style="{ color: numberColors[cell.adjacent] }">{{ cell.adjacent }}</span>
          </template>
        </button>
      </div>
      <div v-if="state === 'won' || state === 'lost'" class="overlay">
        <p class="text-h5 mb-1">{{ state === 'won' ? 'Cleared! 🎉' : 'Boom 💥' }}</p>
        <p v-if="state === 'won'" class="text-body-2 mb-3">Time {{ fmtTime(elapsed) }}</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
      </div>
    </div>

    <p class="text-caption text-medium-emphasis mt-3">Best ({{ level }}): {{ bestLabel }}</p>
    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Link copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
.board-wrap {
  position: relative;
}
.board {
  display: grid;
  gap: 2px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.6);
  width: 100%;
  height: 100%;
}
.cell {
  aspect-ratio: 1 / 1;
  border: none;
  border-radius: 3px;
  background: rgba(124, 58, 237, 0.28);
  font-weight: 700;
  font-size: clamp(0.55rem, 2.2vw, 1rem);
  line-height: 1;
  cursor: pointer;
  transition: background 0.1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cell:hover:not(.cell--revealed) {
  background: rgba(124, 58, 237, 0.45);
}
.cell--revealed {
  background: rgba(148, 163, 184, 0.12);
  cursor: default;
}
.cell--mine {
  background: rgba(248, 113, 113, 0.5);
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(2, 6, 23, 0.75);
  backdrop-filter: blur(3px);
  border-radius: 10px;
}
</style>
