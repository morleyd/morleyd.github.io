<script setup lang="ts">
/**
 * Flood It — flood from the top-left corner, picking colors to absorb the board
 * into one color. Seeded (shareable). Moves scored vs a greedy "par".
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import GameControls from '@/components/GameControls.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed, rngFromSeed } from '@/services/seed'

// Distinct hues + lightness so adjacent warm colors don't blur together
const PALETTE = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#ec4899']

const route = useRoute()
const router = useRouter()

const size = ref(11)
const colorCount = ref(6)
// The sliders bind to drafts and only rebuild on release, so dragging doesn't
// reseed a fresh board on every tick.
const sizeDraft = ref(11)
const colorsDraft = ref(6)
const code = ref('')
const grid = ref<number[]>([])
const moves = ref(0)
const par = ref(0)
const snackbar = ref(false)

const colors = computed(() => PALETTE.slice(0, colorCount.value))
const solved = computed(() => grid.value.length > 0 && grid.value.every((c) => c === grid.value[0]))
// Which colors still appear anywhere on the board (others are "eliminated").
const presentColors = computed(() => new Set(grid.value))

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
      const s = regionOf(tmp, n).length
      if (s > bestSize) {
        bestSize = s
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

const build = () => {
  const n = size.value
  const c = colorCount.value
  const rng = rngFromSeed(`${n}x${c}|${code.value}`)
  let g: number[]
  do {
    g = Array.from({ length: n * n }, () => Math.floor(rng() * c))
  } while (g.every((v) => v === g[0]))
  grid.value = g
  par.value = greedyPar(g, n, c)
  moves.value = 0
}

const syncUrl = () => router.replace({ name: 'flood-it', params: { seed: `${size.value}.${colorCount.value}.${code.value}` } })
const newGame = () => {
  code.value = randomSeed()
  syncUrl()
  build()
}
const commitSize = () => {
  if (sizeDraft.value === size.value) return
  size.value = sizeDraft.value
  newGame()
}
const commitColors = () => {
  if (colorsDraft.value === colorCount.value) return
  colorCount.value = colorsDraft.value
  newGame()
}

const share = async () => {
  const url = window.location.origin + route.fullPath
  const line = solved.value
    ? `Flooded this board in ${moves.value} (${par.value} par). Beat me!`
    : `Try this Flood It board:`
  await copyToClipboard(`${line}\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  const m = /^(\d+)\.(\d+)\.(.+)$/.exec(p)
  if (m) {
    size.value = Math.min(16, Math.max(6, +m[1]))
    colorCount.value = Math.min(8, Math.max(4, +m[2]))
    code.value = m[3]
    build()
  } else {
    newGame()
  }
  sizeDraft.value = size.value
  colorsDraft.value = colorCount.value
})
</script>

<template>
  <v-container class="py-6" max-width="960">
    <GameToolbar title="Flood It" shareable @share="share">
      <template #intro>
        Flood the board from the top-left corner. Pick colors to grow your region until the whole
        board is one color — in as few moves as possible.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Turn the entire board a single color. Your region starts at the top-left corner.</p>
        <h3>How to play</h3>
        <ul>
          <li>Pick a color from the swatches. Your whole region becomes that color and absorbs any touching cells of it.</li>
          <li>Repeat until every cell matches.</li>
        </ul>
        <h3>Scoring</h3>
        <p><span class="k">Par</span> is a greedy solver's move count — match or beat it.</p>
        <h3>Tips</h3>
        <ul>
          <li>Early on, pick the color that grabs the most new cells; late game, think about reaching far corners.</li>
          <li>Don't chase a color just because there's a lot of it — chase what your region actually touches.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="game-stage">
      <div class="game-stage__board">
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

        <div class="board-wrap game-board">
          <div class="board" :style="{ gridTemplateColumns: `repeat(${size}, 1fr)` }">
            <div v-for="(c, i) in grid" :key="i" class="tile" :style="{ background: colors[c] }"></div>
          </div>
          <div v-if="solved" class="overlay">
            <p class="text-h5 mb-1">{{ moves <= par ? 'Under par! 🎉' : 'Flooded!' }}</p>
            <p class="text-body-2 mb-3">{{ moves }} moves ({{ par }} par)</p>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
          </div>
        </div>

        <div class="d-flex justify-center flex-wrap ga-2 mt-4">
          <button
            v-for="(color, k) in colors"
            :key="k"
            type="button"
            class="swatch"
            :class="{ 'swatch--current': grid[0] === k, 'swatch--gone': !presentColors.has(k) }"
            :style="{ background: color }"
            :disabled="solved || !presentColors.has(k)"
            @click="pick(k)"
          ></button>
        </div>
      </div>

      <GameControls class="game-stage__controls" title="Settings">
        <template #actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New game</v-btn>
        </template>
        <div class="slider-wrap">
          <label class="text-caption text-medium-emphasis">Board: {{ sizeDraft }}×{{ sizeDraft }}</label>
          <v-slider v-model="sizeDraft" :min="6" :max="16" :step="1" hide-details density="compact" @end="commitSize" />
        </div>
        <div class="slider-wrap">
          <label class="text-caption text-medium-emphasis">Colors: {{ colorsDraft }}</label>
          <v-slider v-model="colorsDraft" :min="4" :max="8" :step="1" hide-details density="compact" @end="commitColors" />
        </div>
      </GameControls>
    </div>
    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Link copied — challenge a friend!</v-snackbar>
  </v-container>
</template>

<style scoped>
.slider-wrap {
  min-width: 200px;
}
.board-wrap {
  position: relative;
}
.board {
  display: grid;
  gap: 1px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.6);
  width: 100%;
  height: 100%;
}
.tile {
  border-radius: 2px;
  transition: background 0.25s ease;
}
.swatch {
  width: 44px;
  height: 44px;
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
/* An eliminated color: greyed out */
.swatch--gone {
  filter: grayscale(1);
  opacity: 0.3;
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
