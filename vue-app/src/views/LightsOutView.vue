<script setup lang="ts">
/**
 * Lights Out — click a light to toggle it and its orthogonal neighbors; turn
 * them all off. Puzzles are scrambled from the solved state (always solvable).
 * The optimal (fewest clicks) is computed exactly via Gaussian elimination over
 * GF(2), so moves are scored against the true minimum.
 */
import { computed, onMounted, ref, watch } from 'vue'
import GameToolbar from '@/components/GameToolbar.vue'

const size = ref(5)
const lights = ref<number[]>([]) // 0 = off, 1 = on
const moves = ref(0)
const optimal = ref(0)

const solved = computed(() => lights.value.length > 0 && lights.value.every((v) => v === 0))

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

const toggle = (i: number) => {
  if (solved.value) return
  const n = size.value
  const next = lights.value.slice()
  next[i] ^= 1
  for (const j of neighbors(i, n)) next[j] ^= 1
  lights.value = next
  moves.value += 1
}

// Exact minimum number of clicks to clear the board (GF(2) linear algebra).
const optimalMoves = (state: number[], n: number): number => {
  const N = n * n
  const rows: bigint[] = []
  for (let i = 0; i < N; i += 1) {
    let r = 1n << BigInt(i)
    for (const j of neighbors(i, n)) r |= 1n << BigInt(j)
    if (state[i]) r |= 1n << BigInt(N) // right-hand side stored in bit N
    rows.push(r)
  }
  const pivotForCol = new Array(N).fill(-1)
  let rank = 0
  for (let col = 0; col < N; col += 1) {
    let sel = -1
    for (let r = rank; r < rows.length; r += 1) {
      if ((rows[r] >> BigInt(col)) & 1n) {
        sel = r
        break
      }
    }
    if (sel < 0) continue
    ;[rows[rank], rows[sel]] = [rows[sel], rows[rank]]
    pivotForCol[col] = rank
    for (let r = 0; r < rows.length; r += 1) {
      if (r !== rank && (rows[r] >> BigInt(col)) & 1n) rows[r] ^= rows[rank]
    }
    rank += 1
  }
  const freeCols: number[] = []
  const pivotCols: number[] = []
  for (let c = 0; c < N; c += 1) (pivotForCol[c] < 0 ? freeCols : pivotCols).push(c)

  const solveWith = (free: number[]): number[] => {
    const x = new Array(N).fill(0)
    freeCols.forEach((fc, k) => {
      x[fc] = free[k]
    })
    for (const c of pivotCols) {
      const row = rows[pivotForCol[c]]
      let val = Number((row >> BigInt(N)) & 1n)
      for (const fc of freeCols) if ((row >> BigInt(fc)) & 1n) val ^= x[fc]
      x[c] = val
    }
    return x
  }

  const dim = freeCols.length
  const weight = (x: number[]) => x.reduce((a, b) => a + b, 0)
  if (dim > 16) return weight(solveWith(new Array(dim).fill(0)))

  let best = Infinity
  for (let mask = 0; mask < 1 << dim; mask += 1) {
    const free = Array.from({ length: dim }, (_, k) => (mask >> k) & 1)
    best = Math.min(best, weight(solveWith(free)))
  }
  return best
}

const newGame = () => {
  const n = size.value
  const N = n * n
  let state: number[]
  do {
    state = new Array(N).fill(0)
    const clicks = Math.max(3, Math.floor(N * 0.4))
    for (let c = 0; c < clicks; c += 1) {
      const i = Math.floor(Math.random() * N)
      state[i] ^= 1
      for (const j of neighbors(i, n)) state[j] ^= 1
    }
  } while (state.every((v) => v === 0))
  lights.value = state
  optimal.value = optimalMoves(state, n)
  moves.value = 0
}

watch(size, newGame)
onMounted(newGame)
</script>

<template>
  <v-container class="py-6" max-width="620">
    <GameToolbar title="Lights Out">
      <template #intro>
        Click a light to flip it and its neighbors. Turn every light off — in as few clicks as
        possible.
      </template>
      <template #settings>
        <div class="d-flex flex-column ga-4">
          <div class="slider-wrap">
            <label class="text-caption text-medium-emphasis">Size: {{ size }}×{{ size }}</label>
            <v-slider v-model="size" :min="3" :max="7" :step="1" hide-details density="compact" thumb-label />
          </div>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
        </div>
      </template>
    </GameToolbar>

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

    <div class="board-wrap">
      <div class="board" :style="{ gridTemplateColumns: `repeat(${size}, 1fr)` }">
        <button
          v-for="(v, i) in lights"
          :key="i"
          type="button"
          class="light"
          :class="{ 'light--on': v === 1 }"
          @click="toggle(i)"
        ></button>
      </div>
      <div v-if="solved" class="overlay">
        <p class="text-h5 mb-1">{{ moves === optimal ? 'Perfect!' : 'Lights out!' }}</p>
        <p class="text-body-2 mb-3">Solved in {{ moves }} ({{ optimal }} optimal)</p>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" @click="newGame">New puzzle</v-btn>
      </div>
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
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.6);
  aspect-ratio: 1 / 1;
}
.light {
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.8);
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.light:hover {
  transform: scale(1.04);
}
.light--on {
  background: #fbbf24;
  border-color: #fbbf24;
  box-shadow: 0 0 16px rgba(251, 191, 36, 0.6);
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
  border-radius: 14px;
}
</style>
