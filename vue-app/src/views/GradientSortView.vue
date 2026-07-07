<script setup lang="ts">
/**
 * Gradient Sort — a prototype puzzle (à la "I Love Hue").
 * Colors are a smooth 2D gradient produced by bilinear interpolation between 4
 * corner colors, so every tile differs only minutely from its neighbors. The 4
 * corner tiles are fixed anchors; you swap the rest back into gradient order.
 * Moves are tracked against the optimal (min swaps = movable − cycles).
 */
import { computed, onMounted, ref, watch } from 'vue'

type RGB = [number, number, number]
interface Palette {
  name: string
  corners: [RGB, RGB, RGB, RGB] // top-left, top-right, bottom-left, bottom-right
}

const palettes: Palette[] = [
  { name: 'Blush', corners: [[254, 243, 199], [236, 72, 153], [252, 211, 77], [190, 24, 93]] },
  { name: 'Cotton', corners: [[224, 242, 254], [233, 213, 255], [186, 230, 253], [192, 132, 252]] },
  { name: 'Citrus', corners: [[254, 249, 195], [187, 247, 208], [253, 224, 71], [74, 222, 128]] },
  { name: 'Coral', corners: [[255, 237, 213], [254, 205, 211], [253, 186, 116], [244, 114, 182]] },
  { name: 'Twilight', corners: [[199, 210, 254], [221, 214, 254], [129, 140, 248], [167, 139, 250]] },
]

const rows = ref(4)
const cols = ref(4)

const order = ref<number[]>([]) // order[position] = home index of the block there
const moves = ref(0)
const optimal = ref(0)
const selected = ref(-1)
const dragIndex = ref(-1)
const palette = ref<Palette>(palettes[0])

const size = computed(() => rows.value * cols.value)

const cornerSet = computed(
  () => new Set([0, cols.value - 1, (rows.value - 1) * cols.value, size.value - 1]),
)
const isCorner = (pos: number) => cornerSet.value.has(pos)

const solved = computed(
  () => order.value.length > 0 && order.value.every((home, pos) => home === pos),
)

// Bilinear blend of the 4 corner colors for a block's home cell.
const colorFor = (homeIndex: number): string => {
  const r = rows.value > 1 ? Math.floor(homeIndex / cols.value) / (rows.value - 1) : 0
  const c = cols.value > 1 ? (homeIndex % cols.value) / (cols.value - 1) : 0
  const [tl, tr, bl, br] = palette.value.corners
  const mix = (a: RGB, b: RGB, t: number): RGB => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
  const top = mix(tl, tr, c)
  const bottom = mix(bl, br, c)
  const [rr, gg, bb] = mix(top, bottom, r)
  return `rgb(${Math.round(rr)}, ${Math.round(gg)}, ${Math.round(bb)})`
}

// Minimum swaps to sort the movable tiles = movableCount − cycles (corners excluded).
const minSwaps = (arr: number[], corners: Set<number>): number => {
  const seen = new Set<number>()
  let swaps = 0
  for (let start = 0; start < arr.length; start += 1) {
    if (corners.has(start) || seen.has(start)) continue
    let j = start
    let len = 0
    while (!seen.has(j)) {
      seen.add(j)
      j = arr[j]
      len += 1
    }
    swaps += len - 1
  }
  return swaps
}

const newGame = () => {
  const n = size.value
  const corners = cornerSet.value
  const movable = Array.from({ length: n }, (_, i) => i).filter((p) => !corners.has(p))

  palette.value = palettes[Math.floor(Math.random() * palettes.length)]

  let homes: number[]
  do {
    homes = movable.slice()
    for (let i = homes.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[homes[i], homes[j]] = [homes[j], homes[i]]
    }
  } while (movable.length > 1 && homes.every((v, k) => v === movable[k]))

  const arr = new Array(n)
  corners.forEach((p) => {
    arr[p] = p
  })
  movable.forEach((pos, k) => {
    arr[pos] = homes[k]
  })

  order.value = arr
  optimal.value = minSwaps(arr, corners)
  moves.value = 0
  selected.value = -1
}

const swap = (i: number, j: number) => {
  if (i === j || i < 0 || j < 0 || solved.value || isCorner(i) || isCorner(j)) return
  const arr = order.value.slice()
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  order.value = arr
  moves.value += 1
  selected.value = -1
}

const onDragStart = (i: number) => {
  if (!isCorner(i)) dragIndex.value = i
}
const onDrop = (i: number) => {
  swap(dragIndex.value, i)
  dragIndex.value = -1
}

const onTap = (i: number) => {
  if (solved.value || isCorner(i)) return
  if (selected.value === -1) selected.value = i
  else if (selected.value === i) selected.value = -1
  else swap(selected.value, i)
}

watch([rows, cols], newGame)
onMounted(newGame)
</script>

<template>
  <v-container class="py-6" max-width="720">
    <div class="mb-4">
      <h1 class="page-title">Gradient Sort</h1>
      <p class="text-body-1 text-medium-emphasis">
        Every tile is a step in a smooth gradient. The four corners are locked as anchors — drag (or
        tap two) to swap the rest back into order.
      </p>
    </div>

    <!-- Settings -->
    <div class="d-flex align-center flex-wrap ga-6 mb-4">
      <div class="slider-wrap">
        <label class="text-caption text-medium-emphasis">Rows: {{ rows }}</label>
        <v-slider v-model="rows" :min="3" :max="8" :step="1" hide-details density="compact" thumb-label />
      </div>
      <div class="slider-wrap">
        <label class="text-caption text-medium-emphasis">Columns: {{ cols }}</label>
        <v-slider v-model="cols" :min="3" :max="8" :step="1" hide-details density="compact" thumb-label />
      </div>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-shuffle-variant" @click="newGame">
        New game
      </v-btn>
    </div>

    <!-- Scoreboard -->
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-h6">
        Moves: <span class="font-weight-bold">{{ moves }}</span>
        <span class="text-medium-emphasis"> / {{ optimal }} optimal</span>
      </div>
      <v-chip v-if="solved" :color="moves === optimal ? 'success' : 'primary'" variant="flat">
        <v-icon start icon="mdi-check-circle-outline" />
        {{ moves === optimal ? 'Perfect!' : 'Solved!' }}
      </v-chip>
    </div>

    <!-- Grid -->
    <div
      class="sort-grid"
      :class="{ 'sort-grid--solved': solved }"
      :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
    >
      <div
        v-for="(home, pos) in order"
        :key="pos"
        class="sort-block"
        :class="{
          'sort-block--selected': selected === pos,
          'sort-block--fixed': isCorner(pos),
        }"
        :style="{ background: colorFor(home) }"
        :draggable="!solved && !isCorner(pos)"
        @dragstart="onDragStart(pos)"
        @dragover.prevent
        @drop="onDrop(pos)"
        @click="onTap(pos)"
      >
        <v-icon v-if="isCorner(pos)" icon="mdi-lock" size="small" class="lock-icon" />
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.slider-wrap {
  min-width: 180px;
  flex: 1 1 180px;
}

.sort-grid {
  display: grid;
  gap: 6px;
  max-width: 520px;
  margin: 0 auto;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.5);
  transition: box-shadow 0.3s ease;
}

.sort-grid--solved {
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.6), 0 0 32px rgba(34, 197, 94, 0.35);
}

.sort-block {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  cursor: grab;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.sort-block:not(.sort-block--fixed):hover {
  transform: scale(1.05);
  z-index: 1;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}

.sort-block--selected {
  outline: 3px solid #fff;
  outline-offset: -3px;
  transform: scale(1.06);
  z-index: 2;
}

.sort-block--fixed {
  cursor: default;
}

.lock-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(15, 23, 42, 0.55);
}

.sort-grid--solved .sort-block {
  cursor: default;
}
</style>
