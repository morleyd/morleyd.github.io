<script setup lang="ts">
/**
 * Gradient Sort — restore a scrambled bilinear gradient by swapping tiles.
 * Corners are locked anchors; moves scored vs the optimal (min swaps).
 * Deterministic per seed (shareable). Drag a tile onto another, or tap two.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameToolbar from '@/components/GameToolbar.vue'
import GameControls from '@/components/GameControls.vue'
import { copyToClipboard } from '@/services/share'
import { randomSeed, rngFromSeed } from '@/services/seed'

type RGB = [number, number, number]
interface Palette {
  name: string
  corners: [RGB, RGB, RGB, RGB]
}
const palettes: Palette[] = [
  { name: 'Blush', corners: [[254, 243, 199], [236, 72, 153], [252, 211, 77], [190, 24, 93]] },
  { name: 'Cotton', corners: [[224, 242, 254], [233, 213, 255], [186, 230, 253], [192, 132, 252]] },
  { name: 'Citrus', corners: [[254, 249, 195], [187, 247, 208], [253, 224, 71], [74, 222, 128]] },
  { name: 'Coral', corners: [[255, 237, 213], [254, 205, 211], [253, 186, 116], [244, 114, 182]] },
  { name: 'Twilight', corners: [[199, 210, 254], [221, 214, 254], [129, 140, 248], [167, 139, 250]] },
]

const route = useRoute()
const router = useRouter()

// The board is always square (N×N) — one size control, not separate row/column
// sliders. rows and cols are kept equal so the gradient math below is unchanged.
const rows = ref(4)
const cols = ref(4)
// Draft value the size slider binds to while dragging. Rebuilding the board on
// every drag tick fought the thumb (it "jumped back"); instead we track the
// draft live and only rebuild when the drag ends.
const sizeDraft = ref(4)
const code = ref('')
const order = ref<number[]>([])
const moves = ref(0)
const optimal = ref(0)
const selected = ref(-1)
const palette = ref<Palette>(palettes[0])
const snackbar = ref(false)
const hintPos = ref(-1)
const hintsUsed = ref(0)
let hintTimer: ReturnType<typeof setTimeout> | null = null

const size = computed(() => rows.value * cols.value)
const cornerSet = computed(
  () => new Set([0, cols.value - 1, (rows.value - 1) * cols.value, size.value - 1]),
)
const isCorner = (pos: number) => cornerSet.value.has(pos)
const solved = computed(
  () => order.value.length > 0 && order.value.every((home, pos) => home === pos),
)

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

const build = () => {
  const n = size.value
  const corners = cornerSet.value
  const movable = Array.from({ length: n }, (_, i) => i).filter((p) => !corners.has(p))
  const rng = rngFromSeed(`${code.value}|${rows.value}x${cols.value}`)
  palette.value = palettes[Math.floor(rng() * palettes.length)]

  let homes = movable.slice()
  do {
    homes = movable.slice()
    for (let i = homes.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
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

const syncUrl = () => {
  router.replace({ name: 'gradient-sort', params: { seed: `${rows.value}.${cols.value}.${code.value}` } })
}
const clearHint = () => {
  hintPos.value = -1
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = null
}
const newGame = () => {
  code.value = randomSeed()
  clearHint()
  hintsUsed.value = 0
  syncUrl()
  build()
}
// Applied when the size slider is released: only rebuild if the size actually
// changed, so mid-drag ticks never rebuild (which made the thumb jump back).
const commitSize = () => {
  if (sizeDraft.value === rows.value) return
  rows.value = sizeDraft.value
  cols.value = sizeDraft.value
  newGame()
}
// Glow one tile that's out of place, for a few seconds, to unstick the player.
const showHint = () => {
  const misplaced = order.value.findIndex((home, pos) => home !== pos && !isCorner(pos))
  if (misplaced < 0) return
  hintsUsed.value += 1
  hintPos.value = misplaced
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (hintPos.value = -1), 2600)
}

const swap = (i: number, j: number) => {
  if (i === j || i < 0 || j < 0 || solved.value || isCorner(i) || isCorner(j)) return
  clearHint()
  const arr = order.value.slice()
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  order.value = arr
  moves.value += 1
  selected.value = -1
}

// Unified pointer input: drag a tile onto another to swap, or tap two tiles.
let downIndex = -1
let moved = false
const onMove = () => {
  moved = true
}
const onUp = (e: PointerEvent) => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.sort-block') as HTMLElement | null
  const to = el ? Number(el.dataset.index) : -1
  if (moved && to >= 0 && to !== downIndex && !isCorner(to)) {
    swap(downIndex, to)
  } else if (!moved) {
    const i = downIndex
    if (selected.value === -1) selected.value = i
    else if (selected.value === i) selected.value = -1
    else swap(selected.value, i)
  }
  downIndex = -1
}
const onDown = (i: number) => {
  if (solved.value || isCorner(i)) return
  downIndex = i
  moved = false
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
// If the view unmounts mid-drag, onUp never runs — drop the global listeners so
// they don't outlive the component.
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})

const share = async () => {
  const url = window.location.origin + route.fullPath
  const line = solved.value
    ? `I sorted this gradient in ${moves.value}/${optimal.value}. Beat me!`
    : `Can you sort this gradient?`
  await copyToClipboard(`${line}\n${url}`)
  snackbar.value = true
}

onMounted(() => {
  const p = typeof route.params.seed === 'string' ? route.params.seed : ''
  const m = /^(\d+)\.(\d+)\.(.+)$/.exec(p)
  if (m) {
    // Force square even if an old link carried differing dimensions.
    const n = Math.min(8, Math.max(3, +m[1]))
    rows.value = n
    cols.value = n
    code.value = m[3]
    build()
  } else {
    newGame()
  }
  sizeDraft.value = rows.value
})
onBeforeUnmount(clearHint)
</script>

<template>
  <v-container class="py-6" max-width="960">
    <GameToolbar title="Gradient Sort" shareable @share="share">
      <template #intro>
        Every tile is a step in a smooth gradient. The four corners are locked anchors — drag (or tap
        two) to swap the rest back into order.
      </template>
      <template #info>
        <h3>Goal</h3>
        <p>Rearrange the tiles so the colors form one smooth gradient — matching the four locked corner anchors.</p>
        <h3>How to play</h3>
        <ul>
          <li><span class="k">Drag</span> a tile onto another to swap them, or <span class="k">tap</span> one tile then another.</li>
          <li>The <span class="k">corners are fixed</span> — they show the target colors at each corner.</li>
        </ul>
        <h3>Scoring</h3>
        <p><span class="k">Optimal</span> is the fewest swaps possible for this shuffle (N − cycles). Match it for a perfect game.</p>
        <h3>Tips</h3>
        <ul>
          <li>Place a tile directly into its correct spot each swap — every swap should "home" at least one tile.</li>
          <li>Work from the corners inward; edges are constrained by two corners so they're easiest to read.</li>
        </ul>
      </template>
    </GameToolbar>

    <div class="game-stage">
      <div class="game-stage__board">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-h6">
            Moves: <span class="font-weight-bold">{{ moves }}</span>
            <span class="text-medium-emphasis"> / {{ optimal }} optimal</span>
            <span v-if="hintsUsed" class="text-medium-emphasis"> · {{ hintsUsed }} hint{{ hintsUsed === 1 ? '' : 's' }}</span>
          </div>
          <v-chip v-if="solved" :color="moves === optimal && !hintsUsed ? 'success' : 'primary'" variant="flat">
            <v-icon start icon="mdi-check-circle-outline" />
            {{ moves === optimal && !hintsUsed ? 'Perfect!' : 'Solved!' }}
          </v-chip>
        </div>

        <div
          class="sort-grid game-board"
          :class="{ 'sort-grid--solved': solved }"
          :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
        >
          <div
            v-for="(home, pos) in order"
            :key="pos"
            class="sort-block"
            :class="{ 'sort-block--selected': selected === pos, 'sort-block--fixed': isCorner(pos), 'sort-block--hint': hintPos === pos }"
            :style="{ background: colorFor(home) }"
            :data-index="pos"
            @pointerdown="onDown(pos)"
          ></div>
        </div>
      </div>

      <GameControls class="game-stage__controls" title="Settings">
        <template #actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-shuffle-variant" @click="newGame">New game</v-btn>
          <v-btn color="secondary" variant="tonal" prepend-icon="mdi-lightbulb-on-outline" :disabled="solved" @click="showHint">Hint</v-btn>
        </template>
        <div class="slider-wrap">
          <label class="text-caption text-medium-emphasis">Size: {{ sizeDraft }}×{{ sizeDraft }}</label>
          <v-slider v-model="sizeDraft" :min="3" :max="8" :step="1" hide-details density="compact" @end="commitSize" />
        </div>
      </GameControls>
    </div>

    <v-snackbar v-model="snackbar" :timeout="2600" color="secondary">Link copied — share it with friends!</v-snackbar>
  </v-container>
</template>

<style scoped>
.slider-wrap {
  min-width: 200px;
}
.sort-grid {
  display: grid;
  grid-auto-rows: 1fr; /* equal-height rows within the square board */
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.5);
  transition: box-shadow 0.3s ease;
  /* No double-tap-to-zoom on the board (tiles are tapped to swap). */
  touch-action: manipulation;
}
.sort-grid--solved {
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.6), 0 0 32px rgba(34, 197, 94, 0.35);
}
.sort-block {
  border-radius: 8px;
  cursor: grab;
  touch-action: none;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.sort-block:not(.sort-block--fixed):hover {
  transform: scale(1.05);
  z-index: 1;
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
/* Hint: pulse a tile that's out of place. */
.sort-block--hint {
  animation: hintGlow 0.85s ease-in-out infinite;
  z-index: 3;
}
@keyframes hintGlow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.9), 0 0 10px 2px rgba(255, 255, 255, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.95), 0 0 22px 6px rgba(255, 255, 255, 0.7);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sort-block--hint {
    animation: none;
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.95), 0 0 22px 6px rgba(255, 255, 255, 0.7);
  }
}
</style>
