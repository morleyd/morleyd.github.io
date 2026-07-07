<script setup lang="ts">
/**
 * Flood It — starting from the top-left, pick a color to flood the connected
 * region; absorb the whole board into one color in as few moves as possible.
 * "Par" is a greedy solver's move count — match or beat it.
 */
import { computed, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'

const PALETTE = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#a855f7']

const size = ref(11)
const colorCount = ref(6)
const grid = ref<number[]>([])
const moves = ref(0)
const par = ref(0)

const colors = computed(() => PALETTE.slice(0, colorCount.value))
const solved = computed(() => grid.value.length > 0 && grid.value.every((c) => c === grid.value[0]))

const neighbors = (i: number, n: number): number[] => {
  const x = i % n
  const y = Math.floor(i / n)
  const out: number[] = []
  if (x > 0) out.push(i - 1)
  if (x < n - 1) out.push(i + 1)
  if (y > 0) out.push(i - n)
  if (y < n - 1) out.push(i + n)
  return out
}

// Cells connected to the top-left through its current color.
const regionOf = (g: number[], n: number): number[] => {
  const color = g[0]
  const seen = new Uint8Array(g.length)
  const stack = [0]
  seen[0] = 1
  const cells = [0]
  while (stack.length) {
    const i = stack.pop() as number
    for (const j of neighbors(i, n)) {
      if (!seen[j] && g[j] === color) {
        seen[j] = 1
        stack.push(j)
        cells.push(j)
      }
    }
  }
  return cells
}

const flood = (g: number[], n: number, k: number) => {
  if (g[0] === k) return
  for (const i of regionOf(g, n)) g[i] = k
}

// Greedy: each move pick the color that grows the flooded region the most.
const greedyPar = (initial: number[], n: number, c: number): number => {
  const g = initial.slice()
  let count = 0
  let guard = 0
  while (!g.every((v) => v === g[0]) && guard < 2000) {
    guard += 1
    let bestColor = -1
    let bestSize = -1
    for (let k = 0; k < c; k += 1) {
      if (k === g[0]) continue
      const tmp = g.slice()
      flood(tmp, n, k)
      const size = regionOf(tmp, n).length
      if (size > bestSize) {
        bestSize = size
        bestColor = k
      }
    }
    flood(g, n, bestColor)
    count += 1
  }
  return count
}

const pick = (k: number) => {
  if (solved.value || k === grid.value[0]) return
  const next = grid.value.slice()
  flood(next, size.value, k)
  grid.value = next
  moves.value += 1
}

const newGame = () => {
  const n = size.value
  const c = colorCount.value
  let g: number[]
  do {
    g = Array.from({ length: n * n }, () => Math.floor(Math.random() * c))
  } while (g.every((v) => v === g[0]))
  grid.value = g
  par.value = greedyPar(g, n, c)
  moves.value = 0
}

watch([size, colorCount], newGame)
onMounted(newGame)
</script>

<template>
  <v-container class="py-6" max-width="620">
    <GameToolbar title="Flood It">
      <template #intro>
        Flood the board from the top-left corner. Pick colors to grow your region until the whole
        board is one color — in as few moves as possible.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Board: {{ size }}×{{ size }}</label>
            <v-slider v-model="size" :min="6" :max="16" :step="1" hide-details density="compact" thumb-label />
          </div>
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Colors: {{ colorCount }}</label>
            <v-slider v-model="colorCount" :min="4" :max="6" :step="1" hide-details density="compact" thumb-label />
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </div>
      </template>
    </GameToolbar>

    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-h6">
        Moves: <span class="font-weight-bold">{{ moves }}</span>
        <span class="text-medium-emphasis"> / {{ par }} par</span>
      </div>
      <v-chip v-if="solved" :color="moves <= par ? 'success' : 'primary'" variant="flat">
        <v-icon start icon="mdi-check-circle-outline" />
        {{ moves <= par ? 'Under par!' : 'Flooded!' }}
      </v-chip>
    </div>

    <div class="board-wrap">
      <div class="board" :style="{ gridTemplateColumns: `repeat(${size}, 1fr)` }">
        <div
          v-for="(c, i) in grid"
          :key="i"
          class="tile"
          :style="{ background: colors[c] }"
        ></div>
      </div>
      <div v-if="solved" class="overlay">
        <p class="text-h5 mb-1">{{ moves <= par ? 'Under par! 🎉' : 'Flooded!' }}</p>
        <p class="text-body-2 mb-3">{{ moves }} moves ({{ par }} par)</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
      </div>
    </div>

    <!-- Color picker -->
    <div class="d-flex justify-center flex-wrap ga-2 mt-4">
      <button
        v-for="(color, k) in colors"
        :key="k"
        type="button"
        class="swatch"
        :class="{ 'swatch--current': grid[0] === k }"
        :style="{ background: color }"
        :disabled="solved"
        @click="pick(k)"
      ></button>
    </div>
  </v-container>
</template>

<style scoped>
.slider-wrap {
  min-width: 200px;
}
.board-wrap {
  position: relative;
  max-width: 480px;
  margin: 0 auto;
}
.board {
  display: grid;
  gap: 1px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.6);
  aspect-ratio: 1 / 1;
}
.tile {
  aspect-ratio: 1 / 1;
  border-radius: 2px;
  transition: background 0.25s ease;
}
.swatch {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: transform 0.1s ease;
}
.swatch:hover:not(:disabled) {
  transform: scale(1.08);
}
.swatch--current {
  border-color: #fff;
}
.swatch:disabled {
  opacity: 0.5;
  cursor: default;
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
  border-radius: 12px;
}
</style>
